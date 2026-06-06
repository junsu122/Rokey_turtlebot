from setuptools import find_packages, setup

package_name = 'state_manager'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='junsu',
    maintainer_email='junsoo122@naver.com',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'robot2_state_manager = state_manager.robot2_state_manager:main',
            'robot4_state_manager = state_manager.robot4_state_manager:main',
            'mission_coordinator  = state_manager.mission_coordinator:main',
            'mock_robot           = state_manager.mock_robot:main',
        ],
    },
)
