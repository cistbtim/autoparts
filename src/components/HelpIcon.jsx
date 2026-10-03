import { helpUrl, tutorialById } from "../lib/tutorials.js";

// Small "?" button that opens the Help Center in a new tab.
//   <HelpIcon topic="book-in-car"/>   → straight to that tutorial
//   <HelpIcon/>                       → Help Center home (search)
export function HelpIcon({ topic, label, large = false, style, className = "" }) {
  const tut = topic ? tutorialById(topic) : null;
  const title = label || (tut ? `How to: ${tut.title}` : "Help & tutorials");
  return (
    <a className={"help-icon" + (large ? " help-icon-lg" : "") + (className ? " " + className : "")} href={helpUrl(topic)} target="_blank" rel="noopener noreferrer"
      title={title} aria-label={title} style={style}
      onClick={e => e.stopPropagation()}>?</a>
  );
}
