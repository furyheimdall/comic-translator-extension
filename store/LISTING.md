# Chrome 웹 스토어 등록 자료

개발자 대시보드(<https://chrome.google.com/webstore/devconsole>)의 각 칸에 그대로 붙여 넣을 수 있게 정리한 문구입니다. 업로드할 패키지는 [Releases](https://github.com/furyheimdall/comic-translator-extension/releases)의 `comic-translator-extension-<버전>.zip`입니다(`store/` 폴더는 패키지에 들어가지 않습니다).

## 1. 패키지·스토어 정보

| 항목 | 값 |
|---|---|
| 이름 | 만화 번역 · 내 서버 |
| 카테고리 | 도구(Tools) — 또는 접근성(Accessibility) |
| 언어 | 한국어 |
| 공개 범위(권장) | **비공개 링크(Unlisted)**: 링크를 아는 사람만 설치. 처음에는 이것으로 심사를 받고 필요하면 공개로 바꿉니다. |
| 개인정보 처리방침 URL | <https://github.com/furyheimdall/comic-translator-extension/blob/main/PRIVACY.md> |
| 홈페이지 URL | <https://github.com/furyheimdall/comic-translator-extension> |
| 지원 URL | <https://github.com/furyheimdall/comic-translator-extension/issues> |

### 짧은 설명 (132자 이내)

KO
> 웹 페이지의 일본어 만화 이미지를 내 comic-translator 서버로 번역해 그 자리에서 한국어 이미지로 바꿔 보여 줍니다.

EN
> Translates Japanese manga images on web pages into Korean in place, using your own self-hosted comic-translator server.

### 자세한 설명

KO
```
웹 페이지에 올라온 일본어 만화 이미지를, 직접 운영하는 comic-translator 서버로 번역해 원래 자리에서 한국어 이미지로 바꿔 보여 주는 확장 프로그램입니다. 글자 검출·말풍선 지우기·번역·한국어 식자는 모두 내 서버에서 처리합니다.

■ 이런 기능이 있습니다
• 이미지 오른쪽 클릭 → "이 이미지 번역": 원하는 이미지 한 장만 번역
• 이 사이트 번역: 지금 보는 사이트에 머무는 동안 만화 이미지를 화면에 가까운 것부터 차례로 번역
• 사이트별 또는 모든 사이트에서 항상 켜기, 주소만 바뀌는 사이트(SPA)도 지원
• 번역 중 표시(애니메이션)와 원본 보기/번역 보기 전환
• 서버가 제공하는 번역 제공자·모델·추론 수준 선택(추론을 낮출수록 빠름)
• 6자리 코드로 서버와 페어링, 서버에서 언제든 연결 해제

■ 필요한 것
• comic-translator 서버 v0.4.0 이상: https://github.com/furyheimdall/comic-translator
  (GPU가 있는 PC에 설치하는 오픈소스 번역 서버입니다. 이 확장 프로그램만으로는 번역되지 않습니다.)

■ 개인정보
이미지는 사용자가 번역을 켠 페이지에서만, 사용자가 지정한 서버로만 전송됩니다. 개발자나 제3자에게는 어떤 데이터도 보내지 않으며 분석·광고 코드가 없습니다.

번역할 권한이 있는 콘텐츠에만 사용하세요.
```

EN
```
Translate Japanese manga images on any web page into Korean and see the result right where the original image was. Text detection, bubble cleaning, translation and Korean typesetting all run on your own self-hosted comic-translator server.

Features
• Right-click an image → "이 이미지 번역" (translate this image)
• Tab translation: translates manga images on the page, nearest to the viewport first
• Always-on per site or for every site, including single-page apps
• Animated "translating" indicator and original/translated toggle
• Choose the provider, model and reasoning level offered by your server
• Pair with your server using a six-digit code; disconnect any time from the server

Requirements
• comic-translator server v0.4.0 or later: https://github.com/furyheimdall/comic-translator
  (an open-source translation server you install on a PC with a GPU; the extension does not translate on its own)

Privacy
Images are sent only from pages where you turned translation on, and only to the server you configured. Nothing is sent to the developer or third parties; there is no analytics or advertising code.

Please translate only content you have the right to use.
```

## 2. 개인정보 보호 관행 탭

### 단일 목적 설명

> 사용자가 지정한 자체 호스팅 comic-translator 서버를 이용해 웹 페이지의 만화 이미지를 번역하고, 번역된 이미지를 페이지의 원래 자리에 표시합니다.

> Translate manga images on web pages through the user's self-hosted comic-translator server and show the translated images in place.

### 권한별 사유

| 권한 | 사유 |
|---|---|
| `host_permissions: <all_urls>` | 만화 이미지는 사이트마다 다른 이미지 서버(CDN)에 있으므로, 사용자가 번역을 켠 페이지의 이미지를 백그라운드에서 내려받고(페이지 쿠키·Referer가 필요한 경우 포함), 모든 사이트에서 콘텐츠 스크립트로 이미지를 찾아 번역본으로 바꾸며, 사용자가 입력한 자체 서버 주소(임의의 호스트·포트)로 이미지를 보내기 위해 필요합니다. |
| `storage` | 서버 주소, 페어링으로 받은 기기 토큰, 번역 제공자·모델·추론 설정, 자동 번역 사이트 목록을 저장하고, 서비스 워커가 다시 시작돼도 탭별 번역 진행 상태를 이어가기 위해 사용합니다. |
| `tabs` | 번역을 켠 탭에 메시지를 보내 번역된 이미지를 전달하고, 탭의 주소 변경·새로고침·닫힘을 감지해 번역을 다시 시작하거나 정리하며, 팝업에서 현재 탭의 사이트를 표시하기 위해 사용합니다. |
| `declarativeNetRequest` | 일부 이미지 서버는 Referer 헤더가 없으면 이미지를 거부합니다. 백그라운드에서 이미지 다운로드가 거부됐을 때, 그 이미지 주소 한 건에만 Referer를 현재 페이지 주소로 지정하는 임시 세션 규칙을 만들고 다운로드 직후 지웁니다. |
| `alarms` | 서비스 워커가 종료된 뒤에도 진행 중인 번역의 업로드·상태 확인을 30초 간격으로 다시 이어가기 위해 사용합니다. |
| `contextMenus` | 이미지 오른쪽 클릭 메뉴에 “이 이미지 번역” 항목을 추가하기 위해 사용합니다. |

### 원격 코드

> 아니요. 모든 JavaScript는 패키지에 포함되어 있으며, 서버에서 받는 것은 번역된 이미지(PNG)와 JSON 응답뿐입니다.

### 데이터 사용 공개(체크 항목)

| 항목 | 체크 | 설명 |
|---|---|---|
| 웹사이트 콘텐츠 | ✅ | 번역을 켠 페이지의 이미지를 사용자의 서버로 보냅니다. |
| 인증 정보 | ✅ | 페어링으로 받은 기기 토큰을 저장해 사용자의 서버에 인증합니다. |
| 웹 기록 | ✅(권장) | 이미지 주소와 탭 제목을 사용자의 서버 작업 기록에 함께 보냅니다. 심사에서 누락으로 보지 않도록 체크를 권장합니다. |
| 개인 식별 정보·건강·금융·개인 커뮤니케이션·위치·사용자 활동 | ☐ | 수집하지 않습니다. |

다음 세 항목에 모두 동의(인증)합니다.
- 승인된 사용 사례 외에 제3자에게 판매·전송하지 않음
- 단일 목적과 관련 없는 목적으로 사용·전송하지 않음
- 신용도 판단·대출 목적으로 사용·전송하지 않음

## 3. 이미지

| 파일 | 규격 | 용도 |
|---|---|---|
| `images/store-icon-128.png` | 128×128 | 스토어 아이콘 |
| `images/promo-small-440x280.png` | 440×280 | 작은 프로모션 타일 |
| `images/screenshot-1-translated.png` | 1280×800 | 원본과 번역본 비교 |
| `images/screenshot-2-translating.png` | 1280×800 | 번역 중 표시 |
| `images/screenshot-3-popup.png` | 1280×800 | 팝업 |
| `images/screenshot-4-settings.png` | 1280×800 | 설정 화면 |

스크린샷의 만화 원고는 comic-translator 저장소의 합성 원고 생성기(`tests/fixtures/make_sample_pages.py`)로 만든 것입니다. 실제 작품 이미지를 스크린샷에 쓰지 마세요.

아이콘과 프로모션 타일은 `python3 store/make_assets.py`로 다시 만들 수 있습니다.

## 4. 심사 참고 사항(심사자에게 남길 메모)

이 확장은 사용자가 직접 설치한 번역 서버가 있어야 번역이 됩니다. 심사자가 서버 없이 기능을 확인할 수 없어 “기능을 확인할 수 없음”으로 반려될 수 있으므로, 대시보드의 테스트 안내 칸에 아래 문구를 남기세요. 반려되면 심사용 서버 주소와 임시 비밀번호를 따로 제공하는 방법이 있습니다.

> This extension requires a self-hosted comic-translator server (https://github.com/furyheimdall/comic-translator). Without one, you can still check the popup, the settings page (Options), and the "이 이미지 번역" context menu, which opens the settings page until a server is paired. With a server: enter its address in Settings → 페어링 요청, approve the six-digit code on the server's 확장 프로그램 page, pick a provider, then right-click a manga image → 이 이미지 번역.
