import { Fragment } from "react";

type FormattedMessageProps = {
  content: string;
};

export default function FormattedMessage({
  content,
}: FormattedMessageProps) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const boldPattern = /(\*\*[^*]+\*\*)/g;

  function renderInline(text: string, lineKey: string) {
    return text.split(urlPattern).map((part, partIndex) => {
      if (!part) {
        return null;
      }

      if (/^https?:\/\//.test(part)) {
        return (
          <Fragment key={`${lineKey}-url-${partIndex}`}>
            <a
              href={part}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[#ff6534] underline underline-offset-2 transition-colors hover:text-[#ff7a52]"
            >
              {part}
            </a>
          </Fragment>
        );
      }

      return part.split(boldPattern).map((segment, segmentIndex) => {
        if (!segment) {
          return null;
        }

        if (segment.startsWith("**") && segment.endsWith("**")) {
          return (
            <strong key={`${lineKey}-bold-${partIndex}-${segmentIndex}`}>
              {segment.slice(2, -2)}
            </strong>
          );
        }

        return (
          <Fragment key={`${lineKey}-text-${partIndex}-${segmentIndex}`}>
            {segment}
          </Fragment>
        );
      });
    });
  }

  return content.split("\n").map((line, lineIndex, lines) => {
    const urlMatch = line.match(/https?:\/\/[^\s]+/);
    const upvoteMatch = line.match(/(\d[\d,]*)\s+upvotes/i);

    if (urlMatch && upvoteMatch) {
      const prefix = line
        .slice(0, upvoteMatch.index)
        .replace(
          /\b(?:this issue has gained significant attention with|this issue has|this issue|it has|with)\s*$/i,
          ""
        )
        .replace(/[\s([{]+$/g, "")
        .trim();

      return (
        <Fragment key={`line-${lineIndex}`}>
          {prefix ? (
            <>
              {renderInline(prefix, `line-${lineIndex}-prefix`)}
              <br />
            </>
          ) : null}
          <span>{`${upvoteMatch[1]} upvotes`}</span>
          <br />
          <a
            href={urlMatch[0]}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-semibold text-[#ff6534] underline underline-offset-2 transition-colors hover:text-[#ff7a52]"
          >
            Read discussion
          </a>
          {lineIndex < lines.length - 1 ? <br /> : null}
        </Fragment>
      );
    }

    return (
      <Fragment key={`line-${lineIndex}`}>
        {renderInline(line, `line-${lineIndex}`)}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}
