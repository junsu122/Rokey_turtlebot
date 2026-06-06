#!/usr/bin/env python3
"""
Mock Robot — 물리 로봇 없이 mission_coordinator 테스트용

실행 (터미널 2개):
  ros2 run state_manager mock_robot --ros-args -p robot_id:=robot2 -p nav_delay:=3.0
  ros2 run state_manager mock_robot --ros-args -p robot_id:=robot4 -p nav_delay:=3.0
"""

import rclpy
from rclpy.node import Node
from rclpy.executors import ExternalShutdownException
from std_msgs.msg import String
from geometry_msgs.msg import PoseStamped


# 커맨드 수신 시 즉시 전환되는 상태
_CMD_TRANSITION = {
    'START_PATROL':  'PATROL',
    'STOP_PATROL':   'IDLE',
    'INTERACT':      'INTERACTING',
    'RESERVE':       'RESERVED',
    'START_ESCORT':  'ESCORTING',
    'RETURN_HOME':   'RETURNING',
    'EMERGENCY':     'EMERGENCY',
    'RESET':         'IDLE',
}

# 이동이 끝나면 IDLE로 전환되는 상태
_NAV_STATES = {'RESERVED', 'ESCORTING', 'RETURNING'}


class MockRobot(Node):
    def __init__(self):
        super().__init__('mock_robot')

        self.declare_parameter('robot_id',  'robot2')
        self.declare_parameter('nav_delay', 3.0)   # 이동 시뮬레이션 시간(초)

        robot_id  = self.get_parameter('robot_id').value
        nav_delay = self.get_parameter('nav_delay').value
        self._nav_delay = nav_delay
        ns = f'/{robot_id}'

        self._state     = 'PATROL'
        self._nav_timer = None

        self._state_pub = self.create_publisher(String, f'{ns}/robot_state', 10)
        self.create_subscription(String,      f'{ns}/cmd_state', self._on_cmd,     10)
        self.create_subscription(PoseStamped, f'{ns}/nav_goal',  self._on_nav_goal, 10)

        self.create_timer(0.5, self._publish_state)
        self.get_logger().warn(f'[{robot_id}] Mock 로봇 시작  초기상태=PATROL  이동시간={nav_delay}s')

    def _on_cmd(self, msg: String):
        cmd = msg.data.strip()
        new = _CMD_TRANSITION.get(cmd)
        if new is None:
            self.get_logger().warn(f'[CMD] 알 수 없는 커맨드: {cmd}')
            return

        # PATROL 중 START_ESCORT 등 일부 커맨드는 무시 (robot_state_manager 동작 모사)
        if cmd == 'START_ESCORT' and self._state not in ('INTERACTING', 'IDLE', 'PATROL'):
            self.get_logger().info(f'[CMD] {cmd} 무시 (현재={self._state})')
            return
        if cmd == 'RESERVE' and self._state not in ('PATROL', 'IDLE'):
            self.get_logger().info(f'[CMD] {cmd} 무시 (현재={self._state})')
            return
        if cmd == 'START_PATROL' and self._state != 'IDLE':
            self.get_logger().info(f'[CMD] {cmd} 무시 (현재={self._state})')
            return

        self.get_logger().warn(f'[CMD] {self._state} → {new}')
        self._state = new

        if new in _NAV_STATES:
            self._schedule_arrival()

    def _on_nav_goal(self, msg: PoseStamped):
        x = msg.pose.position.x
        y = msg.pose.position.y
        self.get_logger().info(f'[NAV] 목표 수신  ({x:.1f}, {y:.1f})')
        # ESCORTING 중 새 목표 → 타이머 리셋
        if self._state == 'ESCORTING':
            self._schedule_arrival()

    def _schedule_arrival(self):
        if self._nav_timer:
            self._nav_timer.cancel()
        self._nav_timer = self.create_timer(self._nav_delay, self._arrive)

    def _arrive(self):
        if self._nav_timer:
            self._nav_timer.cancel()
            self._nav_timer = None
        if self._state in _NAV_STATES:
            self.get_logger().warn(f'[NAV] 도착  {self._state} → IDLE')
            self._state = 'IDLE'

    def _publish_state(self):
        msg      = String()
        msg.data = self._state
        self._state_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = MockRobot()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
