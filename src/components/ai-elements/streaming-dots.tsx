export function StreamingDots() {
  return (
    <output className="inline-flex gap-1" aria-label="Typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none" />
    </output>
  );
}
