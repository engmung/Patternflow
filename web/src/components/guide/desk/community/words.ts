import type { GuideLang } from "../../store";

// The practice community's own few words, in the page's language. Everything
// else it shows is the real community's UI, in the real UI's English words
// (checked against components/community/** and app/community/**).
//
// These say, where the real thing would reach a board, a server or an
// account, what would happen for real — and that here nothing did. They
// never pretend a board answered.

export type NoteKey =
  | "sentOne"
  | "zip"
  | "download"
  | "built"
  | "sentDeck"
  | "installDeck"
  | "installBasics"
  | "lab"
  | "labHeader"
  | "share"
  | "sharePack"
  | "signIn"
  | "port";

type Words = {
  /** The tag on the banner and on every note. */
  tag: string;
  /** The strip at the top, where the real site puts its firmware notice. */
  banner: string;
  close: string;
  note: (key: NoteKey, n: number) => string;
};

export const PRACTICE_WORDS: Record<GuideLang, Words> = {
  en: {
    tag: "Practice",
    banner: "A practice community: placeholder patterns, connected to nothing. Press anything; nothing leaves this page.",
    close: "Close",
    note: (key, n) => {
      switch (key) {
        case "sentOne":
          return "Nothing was sent. For real, your board's Patterns page opens in a new tab, fetches this pattern and installs it. Hold K4 on the board to find it.";
        case "zip":
          return "No file here. For real, a .zip downloads: drop it on your board's Patterns page as it is, without unzipping it.";
        case "download":
          return "No file here: in the practice nothing downloads.";
        case "built":
          return "For real, Send to my board asks you to sign in first: building a deck needs an account. Here it only pretends to build.";
        case "sentDeck":
          return `Nothing was sent. For real, your board's Patterns page opens and installs these ${n}. Hold K4 on the board to find them.`;
        case "installDeck":
          return "Nothing was sent. For real, your board's Patterns page opens with this deck queued and installs it, order and all. No account needed.";
        case "installBasics":
          return `Nothing was sent. For real, your board's Patterns page opens and installs all ${n} of Basics.`;
        case "lab":
          return "Nothing opens here. For real, a copy of this pattern opens in the community site's own Pattern Lab. Making your own, in your own Lab, is 02, next.";
        case "labHeader":
          return "Pattern Lab is 02, next.";
        case "share":
          return "Sharing puts a deck up for everyone and needs an account, so it isn't part of this practice.";
        case "sharePack":
          return "Nothing to copy here. For real, Share shows this deck's pack address to copy, and Download .zip: anyone with the link can install it. No account needed.";
        case "signIn":
          return "There are no accounts here. For real, looking needs none; building a deck and sharing do.";
        case "port":
          return "For real, you sign in and paste the .h you made in Pattern Lab. It goes up credited to you.";
      }
    },
  },
  ko: {
    tag: "연습",
    banner: "연습용 커뮤니티예요. 패턴은 자리만 채운 거고, 어디에도 연결돼 있지 않아요. 뭘 눌러도 이 페이지 밖으로는 아무것도 안 나가요.",
    close: "닫기",
    note: (key, n) => {
      switch (key) {
        case "sentOne":
          return "아무것도 보내지 않았어요. 실제로는 보드의 Patterns 페이지가 새 탭에서 열리고, 이 패턴을 받아서 설치해요. 보드에서 K4를 꾹 눌러 찾아요.";
        case "zip":
          return "연습이라 파일은 없어요. 실제로는 .zip이 내려받아져요. 압축을 풀지 말고 보드의 Patterns 페이지에 그대로 올려요.";
        case "download":
          return "연습이라 내려받는 파일은 없어요.";
        case "built":
          return "실제로는 Send to my board를 누르면 먼저 로그인하라고 해요. 덱을 빌드하려면 계정이 필요하거든요. 여기선 빌드하는 척만 해요.";
        case "sentDeck":
          return `아무것도 보내지 않았어요. 실제로는 보드의 Patterns 페이지가 열려서 이 ${n}개를 설치해요. 보드에서 K4를 꾹 눌러 찾아요.`;
        case "installDeck":
          return "아무것도 보내지 않았어요. 실제로는 보드의 Patterns 페이지가 이 덱을 받아서 순서까지 그대로 설치해요. 계정은 필요 없어요.";
        case "installBasics":
          return `아무것도 보내지 않았어요. 실제로는 보드의 Patterns 페이지가 열려서 Basics ${n}개를 전부 설치해요.`;
        case "lab":
          return "여기선 열리지 않아요. 실제로는 이 패턴의 복사본이 커뮤니티 사이트의 패턴 랩에서 열려요. 내 랩에서 직접 만드는 건 바로 다음 02예요.";
        case "labHeader":
          return "패턴 랩은 바로 다음 02예요.";
        case "share":
          return "공유하면 모두가 보는 곳에 덱이 올라가고, 계정이 필요해요. 그래서 이 연습엔 없어요.";
        case "sharePack":
          return "여기선 복사할 게 없어요. 실제로는 Share가 이 덱 팩의 주소를 보여 주고 Download .zip도 있어요. 링크만 있으면 누구든 설치할 수 있고, 계정은 필요 없어요.";
        case "signIn":
          return "여기엔 계정이 없어요. 실제로도 구경할 땐 필요 없고, 덱을 빌드하거나 공유할 땐 필요해요.";
        case "port":
          return "실제로는 로그인한 뒤 패턴 랩에서 만든 .h를 붙여 넣어요. 내 이름으로 올라가요.";
      }
    },
  },
};
