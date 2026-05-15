import { Title, Typography } from "./Typography";

interface Slide {
  title: string;
  copy: string;
  body: string;
  icon: React.ReactNode;
  image?: string;
  imageAlt?: string;
}

const SLIDES: Slide[] = [
  {
    title: "詐欺広告とは？",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
    copy: "SNSやウェブサイトなどに表示される詐欺を目的とした広告のことです。",
    image: "/add_example.jpg",
    imageAlt: "実際の詐欺広告の例",
    body: "偽の広告をクリックすると、詐欺サイトや投資詐欺グループのグループに誘導され、お金を騙し取られます。2025年の被害額は約1,274億円（前年比46%増）で過去最悪の被害を記録しており、多くの方々が被害にあっています。",
  },
  {
    title: "よくある手口",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </svg>
    ),
    copy: "著名人の画像や動画を無断で使い「必ず儲かる」などと宣伝する投資勧誘広告や、「今だけ無料」と焦らせる偽キャンペーンなど巧妙な手口が使われています。",
    body: "SNSのグループなどに誘導されると、グループでは詐欺集団側のサクラが「儲かった」などと宣伝し、偽の広告に騙された個人を誘導します。また、近年は生成AIで偽の動画を大量につくることができるようになっています。",
  },
  {
    title: "なぜ対策が必要？",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
    copy: "詐欺犯罪グループだけでなく、海外を含む広告プラットフォームやSNSの運営会社なども複雑に絡む問題で、対策が難しいとされています。",
    body: "手口の巧妙さから詐欺広告の掲載者やSNSグループに参加する犯人を特定することは難しいです。また、現在の法律で政府ができることは、運営会社に対して自主的な取組を求めることに限定されています。オンライン広告詐欺は海外でも問題になっており、台湾ではSNSなどの運営会社に詐欺広告の削除を義務付けるなどの新しい法律を制定しました。",
  },
];

export default function FraudEducationCarousel() {
  return (
    <div className="space-y-3">
      {SLIDES.map((slide, i) => (
        <div
          key={i}
          className="bg-white border border-border rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              {slide.icon}
            </div>
            <Title>{slide.title}</Title>
          </div>
          <Typography>{slide.copy}</Typography>
          {slide.image && (
            <img
              src={slide.image}
              alt={slide.imageAlt ?? ""}
              className="w-full"
            />
          )}
          <Typography size="small">{slide.body}</Typography>
        </div>
      ))}
    </div>
  );
}
