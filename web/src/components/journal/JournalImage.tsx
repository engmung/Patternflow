import Image, { type ImageProps } from "next/image";
import { getJournalImageMeta } from "@/lib/journalImageMeta";

type JournalImageProps = Omit<ImageProps, "src" | "width" | "height" | "alt"> & {
  src?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
};

export default function JournalImage({
  src = "",
  alt = "",
  priority = false,
  sizes = "(max-width: 720px) calc(100vw - 48px), 608px",
  ...props
}: JournalImageProps) {
  const { width, height } = getJournalImageMeta(src);

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      {...(priority ? {} : { loading: "lazy" as const })}
    />
  );
}
