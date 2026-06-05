# Rokey_turtlebot
두산로키 터틀봇을 이용한 경로 안내 로봇 프로젝트

---

## 협업 가이드라인

!!!!!!!!!!!!!본인의 워크스페이스 생성후, 그 안에서 실행시켜주세요!!!!!!!!!!!!!!
```bash
git clone https://github.com/junsu122/Rokey_turtlebot.git src
```

### 📁 1. 폴더 구조
각 파트별로 **별도 폴더**를 생성하여 코드를 정리해 주세요.

```
### 예시 구조 ###

본인 워크스페이스/
    ├── src
        ├── web/               # 웹 인터페이스
        ├── LLM/               # 대규모 언어 모델
        └── STT/               # 음성 인식 (Speech-to-Text)
        ├── navigation/        # 경로 계획 및 주행
        ├── localization/      # 위치 추정
        └── ...
```

---

### 🔀 2. Branch & Pull Request
- 작업은 본인의 폴더 안에서 진행해주세요.
- **개인 branch**에 push 했을시, GitHub 사이트에서 **Pull Request(PR)** 를 생성해 주세요.
- PR이 승인되어야 `main` 브랜치에 반영됩니다.

```bash
# 브랜치 생성 예시
git checkout -b <본인 브랜치 이름>

# 작업 후 push
git push origin <본인 브랜치 이름>
```

---

### 📝 3. 코드 파일 네이밍
코드 파일은 **기능을 한눈에 파악할 수 있는 이름**으로 작성해 주세요.

| 좋은 예 | 나쁜 예 |
|---|---|
| `path_planner.py` | `code1.py` |
| `obstacle_detector.py` | `test_final.py` |
| `map_loader.py` | `new2.py` |

---

### 📦 4. 패키지 형식
코드는 **ROS2 패키지 형식**으로 만들어 주세요.

```
my_package/
├── package.xml
├── setup.py
├── my_package/
│   ├── __init__.py
│   └── my_node.py
└── launch/
    └── my_launch.py
```
