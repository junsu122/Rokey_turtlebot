#!/usr/bin/env python3
"""
RobotStateManager — 공통 클래스 (robot2/robot4 공유)

직접 실행하지 말고 robot2_state_manager 또는 robot4_state_manager를 실행하세요.

States:
  UNDOCKING    — 시작 시 도킹 여부 확인 후 언도킹
  IDLE         — 대기
  PATROL       — 자율 순찰 (경유지 순환)
  INTERACTING  — DB 정보 수신 대기 (정지)
  RESERVED     — 핸드오버 구역으로 이동 중 / 도착 후 대기
  ESCORTING    — 사용자를 목적지(또는 핸드오버 구역)까지 안내
  RETURNING    — 에스코트 완료 후 홈으로 복귀
  EMERGENCY    — 긴급 정지
  LOW_BATTERY  — 배터리 부족 → 자동 도킹/충전
  ERROR        — 로봇 단독 처리 불가 오류

Commands on /{ns}/cmd_state (String):
  START_PATROL  — IDLE → PATROL
  STOP_PATROL   — PATROL → IDLE
  INTERACT      — PATROL/IDLE → INTERACTING
  RESERVE       — PATROL/IDLE → RESERVED  (nav_goal 먼저 수신 필요)
  START_ESCORT  — INTERACTING/IDLE → ESCORTING  (nav_goal 먼저 수신 필요)
  RETURN_HOME   — 대부분 상태 → RETURNING
  EMERGENCY     — 모든 상태 → EMERGENCY
  RESET         — EMERGENCY/ERROR → IDLE
"""

from rclpy.node import Node
from rclpy.action import ActionClient
from enum import Enum

from std_msgs.msg import String
from std_srvs.srv import Empty
from sensor_msgs.msg import BatteryState
from geometry_msgs.msg import PoseStamped, Twist
from nav2_msgs.action import NavigateToPose

try:
    from irobot_create_msgs.msg import DockStatus, HazardDetectionVector, HazardDetection
    from irobot_create_msgs.action import Dock
    _HAS_IROBOT = True
except ImportError:
    _HAS_IROBOT = False


class RobotState(Enum):
    UNDOCKING   = 'UNDOCKING'
    IDLE        = 'IDLE'
    PATROL      = 'PATROL'
    INTERACTING = 'INTERACTING'
    RESERVED    = 'RESERVED'
    ESCORTING   = 'ESCORTING'
    RETURNING   = 'RETURNING'
    EMERGENCY   = 'EMERGENCY'
    LOW_BATTERY = 'LOW_BATTERY'
    CHARGING    = 'CHARGING'
    ERROR       = 'ERROR'


_BATTERY_INTERRUPTIBLE = {
    RobotState.IDLE, RobotState.PATROL, RobotState.INTERACTING,
    RobotState.RESERVED, RobotState.ESCORTING, RobotState.RETURNING,
}


class RobotStateManager(Node):
    def __init__(self, robot_id: str, config: dict):
        super().__init__(f'robot_state_manager_{robot_id}')
        self._robot_id = robot_id
        ns = f'/{robot_id}'

        self._home_pose        = _make_pose(config['home_x'], config['home_y'])
        self._patrol_waypoints = _parse_waypoints(config.get('patrol_waypoints', []))
        self._patrol_idx       = 0
        self._low_batt_thr     = config.get('low_battery_threshold',  0.20)
        self._full_batt_thr    = config.get('full_battery_threshold', 0.90)

        # ── 상태 변수 ────────────────────────────────────────────────────
        self._state            = RobotState.IDLE
        self._goal_handle      = None
        self._pending_nav_goal = None
        self._is_docked        = False
        self._dock_initialized = False

        # ── ROS 인터페이스 ───────────────────────────────────────────────
        self._nav_client    = ActionClient(self, NavigateToPose, f'{ns}/navigate_to_pose')
        self._undock_client = self.create_client(Empty, f'{ns}/undock')
        self._state_pub     = self.create_publisher(String, f'{ns}/robot_state', 10)
        self._cmd_vel_pub   = self.create_publisher(Twist,  f'{ns}/cmd_vel',     10)

        self.create_subscription(String,       f'{ns}/cmd_state',    self._on_cmd_state, 10)
        self.create_subscription(PoseStamped,  f'{ns}/nav_goal',     self._on_nav_goal,  10)
        self.create_subscription(BatteryState, f'{ns}/battery_state',self._battery_cb,   10)

        if _HAS_IROBOT:
            self._dock_action = ActionClient(self, Dock, f'{ns}/dock')
            self.create_subscription(DockStatus,
                                     f'{ns}/dock_status',      self._dock_cb,    10)
            self.create_subscription(HazardDetectionVector,
                                     f'{ns}/hazard_detection',  self._hazard_cb, 10)
        else:
            self.get_logger().warn(f'[{robot_id}] irobot_create_msgs 없음 — dock/hazard 비활성화')
            self._dock_initialized = True

        self.create_timer(0.5, self._publish_state)
        self.get_logger().info(f'RobotStateManager 준비  ns={ns}')

    # ── 명령 수신 ────────────────────────────────────────────────────────
    def _on_cmd_state(self, msg: String):
        cmd = msg.data.strip()
        s   = self._state
        self.get_logger().info(f'[CMD] {cmd}  (현재={s.value})')

        if cmd == 'START_PATROL':
            if s == RobotState.IDLE:
                self._transition(RobotState.PATROL)
                self._next_patrol_goal()

        elif cmd == 'STOP_PATROL':
            if s == RobotState.PATROL:
                self._cancel_navigation()
                self._transition(RobotState.IDLE)

        elif cmd == 'INTERACT':
            if s in (RobotState.PATROL, RobotState.IDLE):
                self._cancel_navigation()
                self._transition(RobotState.INTERACTING)

        elif cmd == 'RESERVE':
            if s in (RobotState.PATROL, RobotState.IDLE):
                self._cancel_navigation()
                self._transition(RobotState.RESERVED)
                self._dispatch_pending_goal('RESERVE')

        elif cmd == 'START_ESCORT':
            if s in (RobotState.INTERACTING, RobotState.IDLE, RobotState.PATROL):
                self._cancel_navigation()
                self._transition(RobotState.ESCORTING)
                self._dispatch_pending_goal('START_ESCORT')

        elif cmd == 'RETURN_HOME':
            if s not in (RobotState.EMERGENCY, RobotState.UNDOCKING,
                         RobotState.LOW_BATTERY, RobotState.CHARGING, RobotState.ERROR):
                self._cancel_navigation()
                self._transition(RobotState.RETURNING)
                self._send_nav_goal(self._home_pose)

        elif cmd == 'EMERGENCY':
            self._emergency_stop()

        elif cmd == 'RESET':
            if s in (RobotState.EMERGENCY, RobotState.ERROR):
                self._transition(RobotState.IDLE)

    # ── Nav goal 버퍼 ────────────────────────────────────────────────────
    def _on_nav_goal(self, msg: PoseStamped):
        self._pending_nav_goal = msg
        # ESCORTING 중 새 목적지 수신 → 즉시 변경 (복구 시나리오 포함)
        if self._state == RobotState.ESCORTING:
            self._cancel_navigation()
            self._send_nav_goal(msg)
            self._pending_nav_goal = None

    def _dispatch_pending_goal(self, for_cmd: str):
        if self._pending_nav_goal is not None:
            self._send_nav_goal(self._pending_nav_goal)
            self._pending_nav_goal = None
        else:
            self.get_logger().error(f'[NAV] {for_cmd}: pending nav_goal 없음 → ERROR')
            self._transition(RobotState.ERROR)

    # ── Nav2 액션 ────────────────────────────────────────────────────────
    def _next_patrol_goal(self):
        if not self._patrol_waypoints:
            self.get_logger().warn('[PATROL] 경유지 미설정')
            return
        pose = self._patrol_waypoints[self._patrol_idx % len(self._patrol_waypoints)]
        self._send_nav_goal(pose)

    def _send_nav_goal(self, pose: PoseStamped):
        if not self._nav_client.server_is_ready():
            self.get_logger().error('[NAV] 서버 미준비 → ERROR')
            self._transition(RobotState.ERROR)
            return
        goal_msg      = NavigateToPose.Goal()
        goal_msg.pose = pose
        fut = self._nav_client.send_goal_async(
            goal_msg, feedback_callback=self._feedback_cb)
        fut.add_done_callback(self._goal_response_cb)
        self.get_logger().info(
            f'[NAV] 목표 전송  ({pose.pose.position.x:.2f}, {pose.pose.position.y:.2f})')

    def _cancel_navigation(self):
        if self._goal_handle is not None:
            self._goal_handle.cancel_goal_async()
            self._goal_handle = None

    def _feedback_cb(self, feedback_msg):
        dist = feedback_msg.feedback.distance_remaining
        self.get_logger().info(f'[NAV] 잔여={dist:.2f}m', throttle_duration_sec=3.0)

    def _goal_response_cb(self, future):
        handle = future.result()
        if not handle.accepted:
            self.get_logger().error('[NAV] goal 거부 → ERROR')
            self._transition(RobotState.ERROR)
            return
        self._goal_handle = handle
        handle.get_result_async().add_done_callback(self._result_cb)

    def _result_cb(self, future):
        self._goal_handle = None
        s = self._state
        self.get_logger().info(f'[NAV] 목표 도달  (state={s.value})')

        if s == RobotState.PATROL:
            self._patrol_idx += 1
            self._next_patrol_goal()

        elif s in (RobotState.RESERVED, RobotState.ESCORTING, RobotState.RETURNING):
            # 공통: IDLE로 전환 → 미션 코디네이터가 다음 단계 결정
            self._transition(RobotState.IDLE)

        elif s == RobotState.LOW_BATTERY:
            self._start_docking()

    # ── 배터리 모니터링 ──────────────────────────────────────────────────
    def _battery_cb(self, msg: BatteryState):
        pct = msg.percentage   # 0.0 ~ 1.0

        if pct <= self._low_batt_thr and self._state in _BATTERY_INTERRUPTIBLE:
            self.get_logger().warn(
                f'[BATTERY] {pct:.0%} ≤ {self._low_batt_thr:.0%} → LOW_BATTERY')
            self._cancel_navigation()
            self._transition(RobotState.LOW_BATTERY)
            self._send_nav_goal(self._home_pose)   # 홈으로 이동 후 도킹

        elif self._state in (RobotState.CHARGING, RobotState.LOW_BATTERY) and pct >= self._full_batt_thr:
            self.get_logger().info(f'[BATTERY] {pct:.0%} 충전 완료 → IDLE')
            self._transition(RobotState.IDLE)

    def _start_docking(self):
        if not _HAS_IROBOT:
            self.get_logger().info('[DOCK] irobot 없음 — CHARGING 전환')
            self._transition(RobotState.CHARGING)
            return
        if not self._dock_action.server_is_ready():
            self.get_logger().error('[DOCK] 도킹 액션 서버 미준비')
            return
        self._dock_action.send_goal_async(Dock.Goal())
        self.get_logger().info('[DOCK] 도킹 요청 전송')

    # ── 도킹 상태 / 충돌 감지 ────────────────────────────────────────────
    def _dock_cb(self, msg: 'DockStatus'):
        self._is_docked = msg.is_docked
        if not self._dock_initialized:
            self._dock_initialized = True
            if self._is_docked:
                self.get_logger().info('[DOCK] 도킹 감지 → 언도킹 시작')
                self._start_undocking()
            else:
                self.get_logger().info('[DOCK] 언도킹 상태 확인 → IDLE')
        elif self._state == RobotState.UNDOCKING and not self._is_docked:
            self.get_logger().info('[DOCK] 언도킹 완료 → IDLE')
            self._transition(RobotState.IDLE)
        elif self._state == RobotState.LOW_BATTERY and self._is_docked:
            self.get_logger().info('[DOCK] 충전 도킹 완료 → CHARGING')
            self._transition(RobotState.CHARGING)

    def _start_undocking(self):
        self._transition(RobotState.UNDOCKING)
        if not self._undock_client.wait_for_service(timeout_sec=3.0):
            self.get_logger().error('[UNDOCK] 서비스 없음 → IDLE 강제')
            self._transition(RobotState.IDLE)
            return
        fut = self._undock_client.call_async(Empty.Request())
        fut.add_done_callback(lambda _: self.get_logger().info('[UNDOCK] 요청 전송'))

    def _hazard_cb(self, msg: 'HazardDetectionVector'):
        for h in msg.detections:
            if h.type == HazardDetection.BUMP:
                self.get_logger().error('[HAZARD] 범퍼 충격 → EMERGENCY')
                self._emergency_stop()
                return

    def _emergency_stop(self):
        self._cancel_navigation()
        self._cmd_vel_pub.publish(Twist())
        self._transition(RobotState.EMERGENCY)

    # ── 공통 유틸 ────────────────────────────────────────────────────────
    def _transition(self, new_state: RobotState):
        if self._state == new_state:
            return
        self.get_logger().warn(f'[STATE] {self._state.value} → {new_state.value}')
        self._state = new_state

    def _publish_state(self):
        msg      = String()
        msg.data = self._state.value
        self._state_pub.publish(msg)


# ── 유틸 함수 ─────────────────────────────────────────────────────────────
def _make_pose(x: float, y: float, frame: str = 'map') -> PoseStamped:
    p = PoseStamped()
    p.header.frame_id    = frame
    p.pose.position.x    = x
    p.pose.position.y    = y
    p.pose.orientation.w = 1.0
    return p


def _parse_waypoints(flat: list) -> list:
    result = []
    for i in range(0, len(flat) - 1, 2):
        result.append(_make_pose(float(flat[i]), float(flat[i + 1])))
    return result
