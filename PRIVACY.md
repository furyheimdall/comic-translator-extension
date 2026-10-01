# 개인정보 처리방침 · Privacy Policy

최종 수정 / Last updated: 2026-10-02
대상 / Applies to: Chrome 확장 프로그램 “만화 번역 · 내 서버” (comic-translator-extension)

---

## 한국어

이 확장 프로그램은 사용자가 **직접 운영하는 comic-translator 서버**로 웹 페이지의 만화 이미지를 보내 번역받고, 번역된 이미지를 페이지에 표시합니다. 개발자는 서버를 운영하지 않으며 어떤 데이터도 받지 않습니다.

### 처리하는 데이터

| 데이터 | 언제 | 어디로 |
|---|---|---|
| 웹 페이지의 이미지 파일(바이트) | 사용자가 탭 번역을 켜거나, 이미지에서 “이 이미지 번역”을 고르거나, 자동 번역(사이트별·모든 사이트)을 켠 경우 | 사용자가 설정한 서버 주소로만 전송 |
| 이미지 주소(URL)와 탭 제목 | 위와 같음. 서버의 작업 기록에서 원본을 구분하는 용도 | 사용자가 설정한 서버 |
| 기기 이름(예: “Chrome · Windows”) | 페어링을 요청할 때 | 사용자가 설정한 서버 |

이미지를 가져올 때는 페이지가 그 이미지를 불러온 것과 같은 조건이 되도록 브라우저의 쿠키를 포함해 요청하고, 거부되면 해당 이미지 주소 한 건에만 Referer 헤더를 현재 페이지 주소로 지정해 다시 요청합니다. 이 요청은 원래 이미지가 있던 사이트로만 갑니다.

### 브라우저에 저장하는 데이터

- `chrome.storage.local`(이 브라우저에만 저장, Chrome 동기화 없음): 서버 주소, 페어링으로 받은 기기 토큰, 기기 이름, 선택한 번역 제공자·모델·추론 수준, 최소 이미지 크기, 자동 번역 설정과 사이트 목록
- `chrome.storage.session`(브라우저를 닫으면 삭제): 번역 중인 탭의 페이지 주소와 진행 상태, 서버 세션 ID, 진행 중인 페어링 요청

확장 프로그램을 제거하면 위 데이터도 함께 삭제됩니다. 설정 화면의 “이 브라우저 연결 해제”로 기기 토큰을 지우고 서버의 기기 목록에서도 제거할 수 있습니다.

### 하지 않는 것

- 개발자나 제3자에게 데이터를 보내지 않습니다. 분석·광고·추적 코드가 없습니다.
- 데이터를 판매하거나, 확장 프로그램의 기능과 관계없는 목적으로 쓰지 않습니다.
- 원격 코드를 내려받아 실행하지 않습니다.
- 사용자가 번역을 켜지 않은 페이지의 이미지는 보내지 않습니다.

### 서버 쪽 처리

전송된 이미지는 사용자가 지정한 comic-translator 서버가 처리하고 보관합니다. 서버는 번역을 위해 이미지에서 읽은 글자를 서버에 설정된 LLM 제공자(로컬 모델 또는 OpenAI 등 외부 서비스)로 보낼 수 있습니다. 보관 기간과 외부 전송 여부는 서버 운영자(대개 사용자 본인)의 설정에 따릅니다.

### 문의

<https://github.com/furyheimdall/comic-translator-extension/issues>

---

## English

This extension sends manga images on web pages to a **comic-translator server that the user runs**, and shows the translated images in place. The developer operates no server and receives no data.

### Data processed

| Data | When | Sent to |
|---|---|---|
| Image files (bytes) from web pages | Only when the user turns on tab translation, chooses “이 이미지 번역” (translate this image) on an image, or enables automatic translation (per site or all sites) | Only the server address the user configured |
| Image URL and tab title | Same as above; used to identify the source in the server's job history | The user's server |
| Device name (e.g. “Chrome · Windows”) | When requesting pairing | The user's server |

To fetch an image the way the page loaded it, the request includes the browser's cookies; if refused, it is retried once with the Referer header set to the current page for that single image URL. These requests go only to the site that hosts the image.

### Data stored in the browser

- `chrome.storage.local` (this browser only, not synced): server address, the device token received by pairing, device name, chosen provider/model/reasoning level, minimum image size, automatic translation settings and site list
- `chrome.storage.session` (cleared when the browser closes): page URLs and progress of translating tabs, server session IDs, a pending pairing request

Uninstalling the extension deletes this data. “이 브라우저 연결 해제” (disconnect this browser) in the settings removes the device token here and from the server's device list.

### What the extension does not do

- No data goes to the developer or third parties. There is no analytics, advertising, or tracking code.
- Data is not sold or used for anything unrelated to the extension's single purpose.
- No remote code is downloaded or executed.
- Images are never sent from pages where the user has not turned translation on.

### Processing on the server

The user's comic-translator server processes and stores the images it receives. To translate, it may send the text recognized in the images to the LLM provider configured on that server (a local model or an external service such as OpenAI). Retention and any external transfer depend on the server operator's settings, usually the user's own.

### Contact

<https://github.com/furyheimdall/comic-translator-extension/issues>
