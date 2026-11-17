// One-line question titles with their inline math typeset: "Solve $x^2=4$"
// renders the formula instead of showing a "[math]" placeholder. Much lighter
// than the full Markdown renderer — safe to use in long lists.

import { memo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export const TitleText = memo(function TitleText({ text }: { text: string }) {
  if (!text.includes("$")) return <>{text}</>;
  return (
    <>
      {text.split(/(\$[^$]+\$)/).map((part, i) =>
        i % 2 ? (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(part.slice(1, -1), { throwOnError: false }),
            }}
          />
        ) : (
          part
        ),
      )}
    </>
  );
});
