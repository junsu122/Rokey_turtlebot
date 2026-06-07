/**
 * All user-facing Korean text in one place (poor-man's i18n).
 * Swap this module to localize the whole kiosk.
 */
export const strings = {
  app: {
    title: 'ALFRED 역사 안내 로봇',
  },

  patrol: {
    // Patrol bottom hint (user-preferred wording).
    hint: '사용하려면 아무키나 누르세요',
  },

  home: {
    greetingPrefix: '안녕하세요, ',
    greetingSuffix: ' 안내로봇 알프레드예요',
    question: '무엇을 도와드릴까요?',
    // Requirement #9 — short button names.
    buttonA: '시설 안내',
    buttonADesc: '지도에서 찾기',
    buttonB: '음성 안내',
    buttonBDesc: '말로 찾기',
    staffCall: '직원 호출',
  },

  map: {
    title: '어디로 안내해 드릴까요?',
    subtitle: '가고 싶은 시설을 눌러주세요',
    floorPickerLabel: '층 선택',
    legend: '시설',
    back: '뒤로',
  },

  voice: {
    title: '어디로 가고 싶으세요?',
    idleHint: '아래 버튼을 누르고 말씀해 주세요',
    tapToSpeak: '눌러서 말하기',
    listening: '듣고 있어요…',
    thinking: '찾고 있어요…',
    youSaid: '이렇게 들었어요',
    notFound: '잘 못 들었어요. 다시 한 번 말씀해 주세요',
    confirmQuestion: (name: string) => `${name}(으)로 안내할까요?`,
    confirmYes: '네, 안내해주세요',
    confirmRetry: '다시 말하기',
    back: '뒤로',
  },

  guiding: {
    // Requirement #7 — exact wording.
    caption: '시설 안내중',
    toDestination: (name: string) => `${name} (으)로 안내하고 있어요`,
    viaTransfer: (via: string, toFloor: string) =>
      `${via}(으)로 이동 후 ${toFloor}에서 이어서 안내해요`,
    handoff: (toFloor: string) => `${toFloor} 로봇이 이어서 안내해 드려요`,
    arrived: '도착했어요!',
    cancel: '안내 취소',
  },

  staff: {
    // Requirement #11.
    title: '직원이 오고 있습니다',
    description: '잠시만 기다려 주세요.',
    note: '※ 직원이 확인 후 닫기를 눌러주세요',
    close: '닫기',
  },
} as const;
