import { evaluate } from "@mdx-js/mdx";
import { Fragment, type ComponentProps, type ComponentType } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import JournalImage from "./JournalImage";

type MdxContentProps = {
  source: string;
};

type MdxComponents = {
  img?: ComponentType<ComponentProps<"img">>;
  video?: ComponentType<ComponentProps<"video">>;
};

export default async function MdxContent({ source }: MdxContentProps) {
  const { default: Content } = (await evaluate(source, {
    Fragment,
    jsx,
    jsxs,
    baseUrl: import.meta.url,
  })) as { default: ComponentType<{ components?: MdxComponents }> };

  const components = {
    img: JournalImage as ComponentType<ComponentProps<"img">>,
    video: (props: ComponentProps<"video">) => (
      <video {...props} preload={props.autoPlay ? "metadata" : props.preload ?? "metadata"} />
    ),
  };

  return <Content components={components} />;
}
