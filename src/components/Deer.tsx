// 手绘风小鹿吉祥物（SVG）
export default function Deer({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-label="小鹿">
      {/* 鹿角 */}
      <path d="M42 34 Q36 20 26 16 M42 30 Q38 18 32 10 M78 34 Q84 20 94 16 M78 30 Q82 18 88 10"
        stroke="#8B5A2B" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <circle cx="26" cy="16" r="3.5" fill="#D98F2B" />
      <circle cx="32" cy="10" r="3" fill="#D98F2B" />
      <circle cx="94" cy="16" r="3.5" fill="#D98F2B" />
      <circle cx="88" cy="10" r="3" fill="#D98F2B" />
      {/* 耳朵 */}
      <ellipse cx="34" cy="42" rx="9" ry="6" fill="#B0713A" transform="rotate(-30 34 42)" />
      <ellipse cx="86" cy="42" rx="9" ry="6" fill="#B0713A" transform="rotate(30 86 42)" />
      {/* 脸 */}
      <ellipse cx="60" cy="62" rx="30" ry="32" fill="#E8B87E" />
      <ellipse cx="60" cy="74" rx="17" ry="12" fill="#F7E3C8" />
      {/* 眼睛 */}
      <circle cx="48" cy="56" r="4.2" fill="#3A2415" />
      <circle cx="72" cy="56" r="4.2" fill="#3A2415" />
      <circle cx="49.5" cy="54.5" r="1.4" fill="#fff" />
      <circle cx="73.5" cy="54.5" r="1.4" fill="#fff" />
      {/* 鼻子嘴 */}
      <ellipse cx="60" cy="71" rx="5" ry="3.8" fill="#8B5A2B" />
      <path d="M60 75 Q60 79 55 80 M60 75 Q60 79 65 80" stroke="#8B5A2B" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 腮红 */}
      <ellipse cx="38" cy="68" rx="5" ry="3" fill="#E5735A" opacity="0.55" />
      <ellipse cx="82" cy="68" rx="5" ry="3" fill="#E5735A" opacity="0.55" />
      {/* 额头花纹 */}
      <circle cx="60" cy="44" r="3" fill="#FDF3E3" />
      <circle cx="52" cy="47" r="2" fill="#FDF3E3" opacity="0.8" />
      <circle cx="68" cy="47" r="2" fill="#FDF3E3" opacity="0.8" />
    </svg>
  );
}
