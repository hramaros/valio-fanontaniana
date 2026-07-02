import { readableText } from "@/lib/shapes";
import { ShapeGlyph } from "@/components/Icon";

export default function AnswerTile({
  answer,
  index = 0,
  selected = false,
  dim = false,
  onClick,
  disabled = false,
}) {
  const text = readableText(answer.color);
  return (
    <button
      type="button"
      className={`answer-tile${selected ? " answer-tile--selected" : ""}${
        dim ? " answer-tile--dim" : ""
      }`}
      style={{ background: answer.color, color: text }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className="answer-tile__glyph">
        <ShapeGlyph index={index} />
      </span>
      <span>{answer.text}</span>
    </button>
  );
}
