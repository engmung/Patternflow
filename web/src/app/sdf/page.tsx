import type { Metadata } from "next";
import { Gowun_Batang } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { SITE_OPEN_GRAPH } from "@/lib/siteMetadata";
import {
  builds,
  countCountries,
  orderedBuilds,
} from "@/components/sections/InsideGlobe/builds";
import FantasiaGardenCanvas from "@/components/sdf/FantasiaGardenCanvas";
import LoopReturn from "@/components/sdf/LoopReturn";
import SdfGlobe from "@/components/sdf/SdfGlobe";
import styles from "@/components/sdf/SdfPage.module.css";

const gowunBatang = Gowun_Batang({
  weight: ["400", "700"],
  preload: false,
  variable: "--font-serif-kr",
  display: "swap",
});

const CONTACT_EMAIL = "contact@patternflow.work";
const MAILTO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "서울디자인페스티벌 — Patternflow 문의",
)}`;
const CROWDSUPPLY_URL = "https://www.crowdsupply.com/engmung/patternflow";
const COMMUNITY_URL = "https://community.patternflow.work/community";
const FILM_EMBED_URL =
  "https://www.youtube-nocookie.com/embed/1tkV8-AgdpA?rel=0&modestbranding=1";
const COUNTRY_COUNT = countCountries(builds);
const COMMUNITY_PATTERNS = 377;
const VARIATION_COUNT = 10;

const EXCLUDE_FROM_GALLERY = new Set([
  "seoul-ddp",
  "seoul-hongdae",
  "seoul-anbu",
  "sf-swartz",
]);

const GALLERY_PHOTOS = orderedBuilds
  .filter((b) => !EXCLUDE_FROM_GALLERY.has(b.id) && b.images?.length)
  .flatMap((b) =>
    b.images!.map((img) => ({
      src: img.src,
      alt: img.alt,
      maker: b.maker,
    })),
  );

export const metadata: Metadata = {
  title: "Patternflow · 서울디자인페스티벌 2026",
  description:
    "인터랙티브 미디어아트를 쉽게, 패턴플로우. 전시·공간 설치 및 워크숍 문의.",
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: "/sdf",
  },
};

const INSTALLATION_CASES = [
  {
    src: "/builds/anbu/visitors.jpg",
    alt: "서울역 안부 전시에서 관람객이 Patternflow의 노브를 돌려 작품을 연주하는 모습",
    title: "안부 (Anbu)",
    place: "Seoul · 2026.10",
    caption: "시각장애 예술가들의 작품을 빛과 소리로 연주한 전시 코너",
  },
  {
    src: "/builds/swartz/on-show.jpg",
    alt: "샌프란시스코 USER EXPERIENCE에 소장된 Patternflow",
    title: "USER EXPERIENCE",
    place: "San Francisco · 2026.10",
    caption: "샌프란시스코 첫 작품 판매 · 소장",
  },
];

const QA_ITEMS = [
  {
    q: "현장에 별도 PC나 전원이 필요한가요?",
    a: "사운드 없이 패턴 체험만 한다면 PC는 필요 없습니다. 보조배터리 하나로 6시간 정도 구동됩니다. PC를 함께 두면 무선으로 사운드 작업까지 연동할 수 있습니다.",
  },
  {
    q: "소규모 대여도 가능한가요?",
    a: "가능합니다. 현재 10대 정도 준비되어 있고, 필요하면 더 마련할 수 있습니다.",
  },
  {
    q: "브랜드 톤에 맞춘 전용 패턴도 제작해 주나요?",
    a: "제작해 드릴 수 있지만, 직접 만들어 보시는 걸 권합니다. 실제로 그렇게 쓰는 편이 Patternflow에 가장 잘 맞습니다.",
  },
  {
    q: "대형 공간으로도 확장할 수 있나요?",
    a: "Patternflow 기기 자체를 키우기보다, 그 컨셉을 가져가 여러 센서와 디스플레이로 공간을 구성하는 방식으로 확장합니다.",
  },
];

export default function SdfPage() {
  return (
    <main className={`${styles.page} ${gowunBatang.variable}`}>
      <section className={styles.opening}>
        <FantasiaGardenCanvas />
        <div className={styles.openingScrim} aria-hidden="true" />

        <header className={styles.openingTop}>
          <Link href="/" className={styles.wordmark} prefetch={false}>
            Patternflow
          </Link>
          <span className={styles.openingDate}>SDF 2026</span>
        </header>

        <div className={styles.openingBottom}>
          <h1 className={styles.displayKo}>
            <span className={styles.word1}>인터랙티브</span>
            <span className={styles.word2}>미디어아트를</span>
            <span className={styles.word3}>쉽게,</span>
            <span className={styles.word4}>패턴플로우</span>
          </h1>

          <div className={styles.openingFoot}>
            <a href={MAILTO_HREF} className={styles.openingEmail}>
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <div className={styles.sheet}>
        <section className={styles.intro}>
          <div className={styles.marginalia}>About</div>
          <div className={styles.introBody}>
            <p className={styles.introKo}>
              Patternflow는 오픈소스 LED 신시사이저 프로젝트입니다. 공개된 설계와
              코드로 누구나 직접 만들 수 있고, 각자 만든 기기와 패턴을 서로 나누며
              커지는 생태계입니다.
            </p>
            <p className={styles.introKo}>
              첫 번째 창작자이자 작가로서, Patternflow로 할 수 있는 일들을 직접
              부딪히며 보여주고 있습니다. 현재는 사운드와 여러 개체 사이의 신호를
              엮어 새로운 장면을 실험하는 중이고, 작은 오브제를 넘어 대형 공간
              설치로 넓히고자 합니다.
            </p>
          </div>
        </section>

        <section className={styles.ledger} aria-label="기록">
          <div className={styles.ledgerItem}>
            <span className={styles.ledgerNum}>233%</span>
            <span className={styles.ledgerKo}>
              <a
                href={CROWDSUPPLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.ledgerLink}
              >
                Crowd Supply
              </a>{" "}
              $23,322
            </span>
          </div>
          <div className={styles.ledgerItem}>
            <span className={styles.ledgerNum}>{COMMUNITY_PATTERNS}+</span>
            <span className={styles.ledgerKo}>
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.ledgerLink}
              >
                커뮤니티
              </a>{" "}
              공유 패턴
            </span>
          </div>
          <div className={styles.ledgerItem}>
            <span className={styles.ledgerNum}>{COUNTRY_COUNT}</span>
            <span className={styles.ledgerKo}>개국 제작·공유</span>
          </div>
          <div className={styles.ledgerItem}>
            <span className={styles.ledgerNum}>{VARIATION_COUNT}+</span>
            <span className={styles.ledgerKo}>소재·형태 변형 사례</span>
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.marginalia}>Film</div>
          <div className={styles.filmFrame}>
            <iframe
              src={FILM_EMBED_URL}
              title="Patternflow 소개 영상"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              className={styles.filmIframe}
            />
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.marginalia}>Collaboration</div>
          <div className={styles.practiceList}>
            <div className={styles.practiceItem}>
              <div className={styles.practiceRow}>
                <div>
                  <h2 className={styles.practiceTitleKo}>전시 · 공간 설치</h2>
                </div>
                <div className={styles.practiceDesc}>
                  <p className={styles.practiceKo}>
                    갤러리, 브랜드 팝업, 페스티벌 공간에 맞춘 인터랙티브 빛·사운드
                    설치를 제작합니다. 관람객이 직접 노브를 돌려 반응하는 오브제부터
                    공간의 소리에 연동되는 맞춤 비주얼까지 현장에 맞게 설계합니다.
                  </p>
                </div>
              </div>

              <div className={styles.casePhotos}>
                {INSTALLATION_CASES.map((item) => (
                  <figure key={item.title} className={styles.figure}>
                    <div className={styles.figureFrame}>
                      <Image
                        src={item.src}
                        alt={item.alt}
                        fill
                        sizes="(max-width: 820px) 100vw, 420px"
                        className={styles.figureImg}
                      />
                    </div>
                    <div className={styles.figureCaption}>
                      <span>{item.title}</span>
                      <span className={styles.figurePlace}>{item.place}</span>
                    </div>
                    <p className={styles.figureSub}>{item.caption}</p>
                  </figure>
                ))}
              </div>
            </div>

            <div className={styles.practiceItem}>
              <div className={styles.practiceRow}>
                <div>
                  <h2 className={styles.practiceTitleKo}>워크숍</h2>
                </div>
                <div className={styles.practiceDesc}>
                  <p className={styles.practiceKo}>
                    AI를 활용해 누구나 쉽게 인터랙티브 미디어아트 패턴을 만들고,
                    실제 LED 패널에 바로 올려보는 워크숍을 진행합니다. 현재
                    서울디자인창업센터 브랜드 대표님들과 파일럿을 진행 중이며,
                    하드웨어를 직접 만드는 과정까지 확장할 예정입니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.marginalia}>Q&amp;A</div>
          <div className={styles.qaList}>
            {QA_ITEMS.map((item) => (
              <div key={item.q} className={styles.qaRow}>
                <h3 className={styles.qaQ}>{item.q}</h3>
                <p className={styles.qaA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.marginalia}>Contact</div>
          <div className={styles.contactInner}>
            <a href={MAILTO_HREF} className={styles.emailLink}>
              {CONTACT_EMAIL}
            </a>
            <a
              href="https://www.instagram.com/patternflow.work/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactSubLink}
            >
              Instagram · @patternflow.work ↗
            </a>
          </div>
        </section>

        <section className={styles.blockNoBorder}>
          <div className={styles.marginalia}>Worldwide</div>
          <SdfGlobe />
        </section>
      </div>

      <section className={styles.formsBand} aria-label="전 세계 제작 사례">
        <div className={styles.formsGrid}>
          {GALLERY_PHOTOS.map((item) => (
            <figure key={item.src} className={styles.formCard}>
              <div className={styles.formFrame}>
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 820px) 48vw, 320px"
                  className={styles.figureImg}
                />
              </div>
              <figcaption className={styles.formMaker}>{item.maker}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <footer className={styles.pageFooter}>
        <div className={styles.colophon}>
          <span>이승훈 · Seoul</span>
          <nav className={styles.colophonLinks} aria-label="Links">
            <Link href="/" prefetch={false}>
              patternflow.work
            </Link>
            <a
              href="https://www.instagram.com/patternflow.work/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
            <a
              href="https://github.com/engmung/Patternflow"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>

      <LoopReturn email={CONTACT_EMAIL} mailtoHref={MAILTO_HREF} />
    </main>
  );
}
