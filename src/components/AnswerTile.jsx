import { readableText } from "@/lib/shapes";

export default function AnswerTile({
  answer,
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
      <span>{answer.text}</span>
    </button>
  );
}
