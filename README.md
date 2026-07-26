# llm-usage-badge

Claude、Codex、Grok のサブスクリプション利用枠を Chrome のツールバーから確認する拡張機能です。

## 開発

```sh
npm install
npm run dev
```

テストと本番ビルドは次のコマンドで実行します。

```sh
npm test
npm run build
```

## Chrome に読み込む

1. `npm install` を実行して依存関係をインストールします。
2. `npm run build` を実行して `dist/` を生成します。
3. Chrome で `chrome://extensions` を開きます。
4. 右上の「デベロッパー モード」を有効にします。
5. 「パッケージ化されていない拡張機能を読み込む」をクリックします。
6. このリポジトリの `dist/` ディレクトリを選択します。
