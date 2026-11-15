/** Native warning only; it cannot guarantee delivery or recovery of a result. */
export function registerResultUnloadWarning(target: EventTarget = window) {
  const warn = (event: Event) => {
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = "";
  };
  target.addEventListener("beforeunload", warn);
  return () => target.removeEventListener("beforeunload", warn);
}
