# LLM Usage Badge — 設計ドキュメント

日付: 2026-07-26
ステータス: 承認済み(ブレインストーミングセッションにて)

## 目的

Claude(Pro/Max)、Codex(ChatGPT サブスクリプション)、Grok(SuperGrok 等)の
サブスクリプション利用枠(5時間ウィンドウ・週次ウィンドウ等の残量)を、
Chrome のツールバーからひと目で確認できるようにする。

## スコープ

- 対象 usage: サブスクリプションの利用枠のみ。API 従量課金や CLI ローカル集計は対象外。
- 利用者: 作者本人のみ(developer mode で load unpacked)。Chrome Web Store 公開は当面しない。
- UI: ツールバーバッジ(最小残量%を常時表示)+クリックで詳細ポップアップ。

## データ取得方式

**内部API直叩き方式**を採用する。

- background service worker が、ブラウザのログイン済み Cookie を使って
  claude.ai / chatgpt.com / grok.com の内部 usage エンドポイントを定期取得する。
- 検討した代替案:
  - 設定ページスクレイピング: API 解析不要だが UI 変更で壊れやすく、裏でページを開く必要があり遅い。不採用。
  - CLI 認証流用+native messaging: 構成が重く、Grok など CLI のないサービスに使えない。不採用。

### 認証の想定(実装前に実地検証必須)

- claude.ai: Cookie のみで内部 API を呼べる想定。
- chatgpt.com: `/api/auth/session` から accessToken を取得し Bearer 付与。
- grok.com: Cookie で rate-limits 系エンドポイントを呼ぶ。

エンドポイントの正確な URL・レスポンス形は非公開であり変わりうるため、
アダプタ実装の最初に DevTools での実地確認を行い、レスポンスをフィクスチャとして保存する。

## アーキテクチャ

```
manifest.json                  # Manifest V3
src/
├── background.ts              # service worker: chrome.alarms(30分+ジッター) + 手動更新
├── adapters/
│   ├── types.ts               # 共通モデル UsageSnapshot
│   ├── claude.ts              # claude.ai アダプタ
│   ├── codex.ts               # chatgpt.com アダプタ
│   └── grok.ts                # grok.com アダプタ
├── popup/                     # 素の HTML/CSS/TS(フレームワークなし)
└── storage.ts                 # chrome.storage.local ラッパ
tests/                         # アダプタ正規化のユニットテスト(vitest)
```

- スタック: TypeScript + Vite(ビルドのみ)。ポップアップは単純なので UI フレームワークは使わない(YAGNI)。
- `host_permissions` は `https://claude.ai/*` `https://chatgpt.com/*` `https://grok.com/*` の3ドメインに限定。

### 共通モデル

```ts
type UsageSnapshot = {
  provider: 'claude' | 'codex' | 'grok'
  status: 'ok' | 'unauthenticated' | 'error'
  windows: { label: string; usedPct: number; resetAt?: string }[]
  fetchedAt: string
}
```

### データフロー

1. service worker が alarms(30分間隔+ジッター)またはポップアップの手動更新で3アダプタを並列実行。
2. 各アダプタが内部 API を取得し UsageSnapshot に正規化。
3. 結果を chrome.storage.local に保存。
4. バッジには3サービス中「最も残量が少ない%」を表示。残量に応じて緑/黄/赤。
5. ポップアップは保存値を即表示してから裏で更新(stale-while-revalidate)。

## エラー処理

- アダプタは完全分離。1つ壊れても他の2つは表示継続。
- 壊れたアダプタは「取得失敗(最終成功: X時間前)」とポップアップに表示。
- 未ログインは `unauthenticated` としてログインページへのリンクを表示。
- 認証エラー・スキーマ変化(パース失敗)・ネットワークエラーは区別して表示。
- 手動更新は10秒スロットルで連打防止。

## テスト方針

- フィクスチャ JSON に対する正規化ロジックのユニットテスト(vitest)のみ。
- E2E は load unpacked での手動確認。個人ツールのため軽量に保つ。

## リスク

- 非公開 API のため、いつ仕様変更で壊れてもおかしくない。
  アダプタ分離+フィクスチャで影響を局所化し、修正コストを最小化する。
- 各サービスへのポーリング負荷は30分間隔+ジッターで最小限に抑える。
