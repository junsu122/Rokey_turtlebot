#!/usr/bin/env python3
"""
robot2 State Manager

실행:
  ros2 run state_manager robot2_state_manager
"""

import rclpy
from rclpy.executors import ExternalShutdownException
from state_manager.robot_state_manager import RobotStateManager

# ── robot2 설정 ────────────────────────────────────────────────────────────
ROBOT2_CONFIG = {
    'home_x': 0.0,
    'home_y': 0.0,
    'patrol_waypoints':       [1.0, 0.0,  2.0, 1.0,  0.0, 2.0],   # x0,y0, x1,y1, ...
    'low_battery_threshold':  0.20,   # 20% 이하 → LOW_BATTERY
    'full_battery_threshold': 0.90,   # 90% 이상 → 충전 완료
}


def main(args=None):
    rclpy.init(args=args)
    node = RobotStateManager('robot2', ROBOT2_CONFIG)
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
