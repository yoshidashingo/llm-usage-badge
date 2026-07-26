import "./style.css";

const status = document.querySelector<HTMLElement>("[data-status]");

if (status) {
  status.textContent = "利用状況の表示は今後の Issue で実装します。";
}

