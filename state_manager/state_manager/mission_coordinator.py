#!/usr/bin/env python3
"""
Mission Coordinator — 2대 로봇 에스코트 미션 관리

실행:
  ros2 run state_manager mission_coordinator

━━ DB 미션 메세지 형식 (/db_mission, String JSON) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1단계 메세지 (미션 시작):
  {
    "send_robot":       "A",        -- 먼저 이동하는 로봇 ("A"=robot2 / "B"=robot4)
    "goal_A":           "stairs",   -- robot2(A) 에스코트 목적지
    "goal_B":           "bathroom", -- robot4(B) 에스코트 목적지
    "handover_station": "stairs"    -- 보조 로봇이 대기할 위치
  }

  2단계 메세지 (보조 로봇 출발 트리거):
    1단계와 동일 형식. 보조 로봇에 해당하는 goal 필드를 목적지로 사용.

━━ 동작 흐름 (send_robot="A" 예시) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. robot2 → goal_A 에스코트       /  robot4 → handover_station 대기
  2. robot2 도착 → PATROL 복귀      /  robot4 대기 중
  3. 2단계 DB 메세지 수신 → robot4 → goal_B 에스코트
  4. robot4 도착 → PATROL

  단독 (한 로봇만 가용):
    가용 로봇만 자신의 goal로 에스코트 → 도착 → PATROL

━━ 발행 상태 (/mission_state) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PATROL / INTERACTING / ONE_ROBOT_BUSY / TWO_ROBOT_BUSY
  ONE_ROBOT_CHARGING / TWO_ROBOT_CHARGING / EMERGENCY / CANCEL / ERROR
"""

import json
import rclpy
from rclpy.node import Node
from rclpy.executors import ExternalShutdownException
from enum import Enum

from std_msgs.msg import String
from geometry_msgs.msg import PoseStamped


# ── 위치 이름 → 좌표 (map 프레임 기준, 실제 맵에 맞게 수정) ────────────────────
LOCATIONS: dict[str, tuple] = {
    'stairs':    (3.0, 2.0),
    'elevator':  (4.0, 3.0),
}

_ROBOT_IDS = ('robot2', 'robot4')
_ROBOT_A   = 'robot2'   # 고정: A 역할
_ROBOT_B   = 'robot4'   # 고정: B 역할

# 에스코트 중 복구를 트리거하는 상태 (LOW_BATTERY는 순찰 중에만 robot_state_manager가 처리)
_ESCORT_INTERRUPT = {'EMERGENCY', 'ERROR'}


class MissionState(Enum):
    """외부로 발행되는 관찰 가능한 시스템 상태"""
    PATROL             = 'PATROL'
    INTERACTING        = 'INTERACTING'
    ONE_ROBOT_BUSY     = 'ONE_ROBOT_BUSY'
    TWO_ROBOT_BUSY     = 'TWO_ROBOT_BUSY'
    ONE_ROBOT_CHARGING = 'ONE_ROBOT_CHARGING'
    TWO_ROBOT_CHARGING = 'TWO_ROBOT_CHARGING'
    EMERGENCY          = 'EMERGENCY'
    CANCEL             = 'CANCEL'
    ERROR              = 'ERROR'


class MissionCoordinator(Node):
    def __init__(self):
        super().__init__('mission_coordinator')

        # 내부 페이즈: 'idle' / 'first_moving' / 'second_waiting' / 'second_moving'
        #   first_moving  : 첫 번째 로봇 goal 이동 중 + 보조 로봇 handover_station 이동 중
        #   second_waiting: 첫 번째 로봇 PATROL 복귀 완료, 보조 로봇 대기 중
        #   second_moving : 보조(또는 단독) 로봇 최종 goal 이동 중
        self._phase           = 'idle'
        self._robot_first     = None   # 먼저 이동하는 로봇 (send_robot 기준)
        self._robot_second    = None   # 나중에 이동하는 로봇 (handover_station 대기 후 출발)
        self._goal_first      = None   # 첫 번째 로봇 목적지
        self._goal_second     = None   # 두 번째 로봇 목적지
        self._trigger_pending = False  # 2단계 트리거 수신됐지만 보조 로봇 아직 미도착
        self._is_cancelled    = False

        self._last_pub_state  = MissionState.PATROL
        self._robot_states: dict[str, str] = {r: '' for r in _ROBOT_IDS}

        # ── 퍼블리셔 ─────────────────────────────────────────────────────
        self._cmd_pubs = {
            r: self.create_publisher(String,      f'/{r}/cmd_state', 10)
            for r in _ROBOT_IDS
        }
        self._nav_pubs = {
            r: self.create_publisher(PoseStamped, f'/{r}/nav_goal',  10)
            for r in _ROBOT_IDS
        }
        self._mission_pub = self.create_publisher(String, '/mission_state', 10)

        # ── 서브스크립션 ─────────────────────────────────────────────────
        for r in _ROBOT_IDS:
            self.create_subscription(
                String, f'/{r}/robot_state',
                lambda msg, rid=r: self._on_robot_state(rid, msg), 10)

        self.create_subscription(String, '/db_mission',      self._on_db_mission, 10)
        self.create_subscription(String, '/mission_confirm', self._on_confirm,   10)
        self.create_subscription(String, '/mission_cancel',  self._on_cancel,    10)

        self.create_timer(0.5, self._publish_mission_state)
        self.get_logger().info('MissionCoordinator 준비')

    # ── 관찰 상태 계산 ───────────────────────────────────────────────────
    def _compute_state(self) -> MissionState:
        """
        우선순위:
          EMERGENCY > ERROR > TWO_ROBOT_CHARGING > ONE_ROBOT_CHARGING
          > CANCEL > INTERACTING > TWO_ROBOT_BUSY > ONE_ROBOT_BUSY > PATROL
        """
        states   = [self._robot_states[r] for r in _ROBOT_IDS]
        charging = states.count('CHARGING')

        if 'EMERGENCY' in states:   return MissionState.EMERGENCY
        if 'ERROR'     in states:   return MissionState.ERROR
        if charging == 2:           return MissionState.TWO_ROBOT_CHARGING
        if charging == 1:           return MissionState.ONE_ROBOT_CHARGING
        if self._is_cancelled:      return MissionState.CANCEL
        if 'INTERACTING' in states: return MissionState.INTERACTING

        # '' (미수신) 는 busy 카운트에서 제외 — 초기화 중인 상태
        not_patrol = sum(1 for s in states if s not in ('PATROL', ''))
        if not_patrol == 2: return MissionState.TWO_ROBOT_BUSY
        if not_patrol == 1: return MissionState.ONE_ROBOT_BUSY
        return MissionState.PATROL

    def _is_busy(self, robot_id: str) -> bool:
        """PATROL/IDLE 이 아니면 busy (새 goal 수신 불가)."""
        return self._robot_states[robot_id] not in ('PATROL', 'IDLE')

    # ── DB 미션 수신 ─────────────────────────────────────────────────────
    def _on_db_mission(self, msg: String):
        # second_waiting 중 /db_mission 추가 수신은 무시 (/mission_confirm 으로 처리)
        if self._phase == 'second_waiting':
            self.get_logger().info('[MISSION] 대기 중 — /mission_confirm 버튼을 눌러주세요')
            return

        if self._phase != 'idle':
            self.get_logger().warn('[MISSION] 미션 진행 중 → DB 미션 무시')
            return

        # ── 새 미션 파싱 ─────────────────────────────────────────────────
        try:
            data          = json.loads(msg.data)
            send_robot    = data.get('send_robot', 'A')
            goal_a_name   = data['goal_A']
            goal_b_name   = data['goal_B']
            handover_name = data['handover_station']
        except (json.JSONDecodeError, KeyError) as e:
            self.get_logger().error(f'[MISSION] JSON 파싱 오류: {e}')
            return

        goal_a_pose   = self._resolve(goal_a_name)
        goal_b_pose   = self._resolve(goal_b_name)
        handover_pose = self._resolve(handover_name)
        if None in (goal_a_pose, goal_b_pose, handover_pose):
            return

        # send_robot 으로 첫 번째/두 번째 로봇 결정
        if send_robot == 'A':
            first,  first_goal  = _ROBOT_A, goal_a_pose
            second, second_goal = _ROBOT_B, goal_b_pose
        else:
            first,  first_goal  = _ROBOT_B, goal_b_pose
            second, second_goal = _ROBOT_A, goal_a_pose

        first_busy  = self._is_busy(first)
        second_busy = self._is_busy(second)

        if first_busy and second_busy:
            self.get_logger().warn('[MISSION] 두 로봇 모두 busy → 무시')
            return

        self._goal_first      = first_goal
        self._goal_second     = second_goal
        self._trigger_pending = False

        if not first_busy and not second_busy:
            # 정상 흐름: 첫 번째 로봇 → goal / 두 번째 로봇 → handover_station 대기
            first_goal_name  = goal_a_name if send_robot == 'A' else goal_b_name
            self.get_logger().warn(
                f'[MISSION] 시작  first={first}→{first_goal_name}'
                f'  second={second}→대기:{handover_name}')
            self._robot_first  = first
            self._robot_second = second
            self._phase        = 'first_moving'
            self._nav(first,  first_goal)
            self._cmd(first,  'START_ESCORT')
            self._nav(second, handover_pose)
            self._cmd(second, 'RESERVE')

        elif not first_busy:
            # 두 번째 로봇 busy → 첫 번째 로봇 단독 에스코트
            first_goal_name = goal_a_name if send_robot == 'A' else goal_b_name
            self.get_logger().warn(
                f'[MISSION] 단독  {first}→{first_goal_name}  ({second} busy)')
            self._robot_first  = None
            self._robot_second = first   # 단독 로봇을 second 슬롯으로 추적
            self._phase        = 'second_moving'
            self._nav(first, first_goal)
            self._cmd(first, 'START_ESCORT')

        else:
            # 첫 번째 로봇 busy → 두 번째 로봇 단독 에스코트
            second_goal_name = goal_b_name if send_robot == 'A' else goal_a_name
            self.get_logger().warn(
                f'[MISSION] 단독  {second}→{second_goal_name}  ({first} busy)')
            self._robot_first  = None
            self._robot_second = second
            self._phase        = 'second_moving'
            self._nav(second, second_goal)
            self._cmd(second, 'START_ESCORT')

    def _on_confirm(self, msg: String):
        """UI 확인 버튼 → 보조 로봇 출발 트리거 (/mission_confirm, data='check')."""
        if msg.data != 'check':
            return
        if self._phase != 'second_waiting':
            self.get_logger().info('[CONFIRM] 대기 중인 미션 없음 → 무시')
            return
        self.get_logger().warn('[CONFIRM] check 수신 → 보조 로봇 출발')
        self._start_second_escort()

    def _start_second_escort(self):
        """보조 로봇이 IDLE 이면 즉시 출발, 아직 이동 중이면 도착 후 자동 출발 예약."""
        s_state = self._robot_states.get(self._robot_second, '')
        if s_state in ('IDLE', 'INTERACTING'):
            self.get_logger().warn(f'[MISSION] 보조 로봇 출발  {self._robot_second}')
            self._nav(self._robot_second, self._goal_second)
            self._cmd(self._robot_second, 'START_ESCORT')
            self._phase           = 'second_moving'
            self._trigger_pending = False
        else:
            self.get_logger().info(
                f'[MISSION] 보조 로봇 미도착 ({s_state}) → 도착 후 자동 출발 예약')
            self._trigger_pending = True

    # ── 로봇 상태 감시 ───────────────────────────────────────────────────
    def _on_robot_state(self, robot_id: str, msg: String):
        prev = self._robot_states.get(robot_id, '')
        new  = msg.data
        if prev == new:
            return
        self._robot_states[robot_id] = new
        self.get_logger().info(f'[ROBOT] {robot_id}: {prev or "?"} → {new}')
        self._handle_robot_transition(robot_id, prev, new)

    def _handle_robot_transition(self, robot_id: str, prev: str, new: str):
        ph = self._phase

        # ── CANCEL 복귀 완료 체크 ─────────────────────────────────────────
        if self._is_cancelled:
            op = [s for s in self._robot_states.values()
                  if s not in ('EMERGENCY', 'ERROR')]
            if all(s in ('PATROL', 'IDLE', 'CHARGING', '') for s in op):
                self._is_cancelled = False
                self.get_logger().info('[CANCEL] 복귀 완료 → PATROL 재개')
                for r in _ROBOT_IDS:
                    if self._robot_states[r] == 'IDLE':
                        self._cmd(r, 'START_PATROL')
            return

        # ── 에스코트 중 EMERGENCY/ERROR → 복구 (LOW_BATTERY 제외) ─────────
        if new in _ESCORT_INTERRUPT and ph in ('first_moving', 'second_waiting', 'second_moving'):
            self._handle_escort_interruption(robot_id, new)
            return

        # ── IDLE → START_PATROL (현재 미션에서 역할 없을 때) ────────────────
        if new == 'IDLE' and not self._is_mission_active(robot_id):
            self._cmd(robot_id, 'START_PATROL')
            return

        # ── 첫 번째 로봇: goal 도달 → PATROL 복귀 ────────────────────────
        if (ph == 'first_moving'
                and robot_id == self._robot_first
                and prev == 'ESCORTING' and new == 'IDLE'):
            self.get_logger().warn(f'[MISSION] 첫 번째 로봇 도달 → PATROL  ({robot_id})')
            self._cmd(robot_id, 'START_PATROL')
            self._phase = 'second_waiting'
            return

        # ── 보조 로봇: handover_station 도달 → 대기 ─────────────────────
        if (ph in ('first_moving', 'second_waiting')
                and robot_id == self._robot_second
                and prev == 'RESERVED' and new == 'IDLE'):
            self.get_logger().info(f'[MISSION] 보조 로봇 대기 지점 도착  ({robot_id})')
            if self._trigger_pending:
                self._start_second_escort()
            return

        # ── 보조(또는 단독) 로봇: 최종 goal 도달 → 미션 완료 ────────────────
        if (ph == 'second_moving'
                and robot_id == self._robot_second
                and new == 'IDLE'):
            self.get_logger().warn('[MISSION] 에스코트 완료 → PATROL')
            self._on_mission_completed()

    def _is_mission_active(self, robot_id: str) -> bool:
        """해당 로봇이 현재 미션에서 아직 역할이 있으면 True (IDLE 시 자동 PATROL 방지)."""
        ph = self._phase
        if ph == 'idle':
            return False
        if ph == 'first_moving':
            return True   # 양쪽 모두 활성
        if ph in ('second_waiting', 'second_moving'):
            return robot_id == self._robot_second   # 보조 로봇만 활성
        return False

    # ── 에스코트 중 복구 ─────────────────────────────────────────────────
    def _handle_escort_interruption(self, robot_id: str, reason: str):
        self.get_logger().error(f'[RECOVERY] {robot_id} → {reason}')

        if self._phase == 'first_moving' and robot_id == self._robot_first:
            # 첫 번째 로봇 불가 → 보조 로봇도 귀환, 미션 중단
            self.get_logger().error('[RECOVERY] 첫 번째 로봇 불가 → 미션 중단')
            if self._robot_second:
                self._cmd(self._robot_second, 'RETURN_HOME')
            self._reset_mission()

        elif robot_id == self._robot_second:
            # 보조/최종 로봇 불가 → 미션 중단
            self.get_logger().error('[RECOVERY] 보조 로봇 불가 → 미션 중단')
            self._reset_mission()

    # ── 외부 입력 ─────────────────────────────────────────────────────────
    def _on_cancel(self, _: String):
        cur = self._compute_state()
        if cur in (MissionState.PATROL, MissionState.CANCEL):
            return
        self.get_logger().warn('[MISSION] 미션 취소')
        self._do_cancel()

    def _do_cancel(self):
        for r in _ROBOT_IDS:
            self._cmd(r, 'RETURN_HOME')
        self._reset_mission()
        self._is_cancelled = True

    # ── 미션 완료 ────────────────────────────────────────────────────────
    def _on_mission_completed(self):
        self._reset_mission()
        for r in _ROBOT_IDS:
            if self._robot_states[r] == 'IDLE':
                self._cmd(r, 'START_PATROL')

    def _reset_mission(self):
        self._robot_first     = None
        self._robot_second    = None
        self._goal_first      = None
        self._goal_second     = None
        self._trigger_pending = False
        self._phase           = 'idle'

    # ── 위치 이름 → PoseStamped ───────────────────────────────────────────
    def _resolve(self, name: str) -> PoseStamped | None:
        if name not in LOCATIONS:
            self.get_logger().error(
                f'[LOCATION] 알 수 없는 위치: "{name}"  (등록된: {list(LOCATIONS.keys())})')
            return None
        x, y = LOCATIONS[name]
        return _make_pose(x, y)

    # ── 공통 유틸 ────────────────────────────────────────────────────────
    def _cmd(self, robot_id: str, command: str):
        msg      = String()
        msg.data = command
        self._cmd_pubs[robot_id].publish(msg)
        self.get_logger().info(f'[CMD] → {robot_id}: {command}')

    def _nav(self, robot_id: str, pose: PoseStamped):
        self._nav_pubs[robot_id].publish(pose)
        self.get_logger().info(
            f'[NAV] → {robot_id}:  ({pose.pose.position.x:.2f}, {pose.pose.position.y:.2f})')

    def _publish_mission_state(self):
        state = self._compute_state()
        if state != self._last_pub_state:
            self.get_logger().warn(f'[MISSION] {self._last_pub_state.value} → {state.value}')
            self._last_pub_state = state
        msg      = String()
        msg.data = state.value
        self._mission_pub.publish(msg)


def _make_pose(x: float, y: float, frame: str = 'map') -> PoseStamped:
    p                     = PoseStamped()
    p.header.frame_id     = frame
    p.pose.position.x     = x
    p.pose.position.y     = y
    p.pose.orientation.w  = 1.0
    return p


def main(args=None):
    rclpy.init(args=args)
    node = MissionCoordinator()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
