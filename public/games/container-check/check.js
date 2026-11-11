// Draft QA-only ready signal; not a Game SDK or score protocol.
const nonce = new URLSearchParams(location.search).get("nonce");
parent.postMessage({ type: "ai-hub:container-check-ready", version: 0, nonce }, location.origin);
let count = 0;
document.getElementById("interact").addEventListener("click", () => {
  count += 1;
  document.getElementById("feedback").textContent = "استجابت الصفحة بنجاح · عدد النقرات: " + count;
});
