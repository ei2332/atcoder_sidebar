# AtCoder Sidebar

AtCoder のコンテストページに、折りたたみ式のサイドバーを追加する
Tampermonkey 用ユーザースクリプトです。

## 主な機能

- お気に入りユーザーと自分の順位・提出状況を一覧表示
- 問題ごとの AC 数と、AC した参加者の推定内部レート分布を表示
- 自分の WA セルから、その問題の最新提出を確認
- サーバー時刻をサイドバー内に表示
- 表示状態と取得結果をタブ間で共有

## インストール

1. ブラウザーに [Tampermonkey](https://www.tampermonkey.net/) をインストールします。
2. [AtCoder Sidebar をインストール](https://gist.github.com/ei2332/0fc4cd748b9dc86341c07a434cbfb033/raw/atcoder-sidebar.user.js) を開き、Tampermonkey の確認画面でインストールします。
3. AtCoder にログインし、コンテストページを開きます。

画面右下の「順位表」ボタンでサイドバーを開閉できます。順位表には、AtCoder
上でお気に入りに登録され、ブラウザーの `localStorage["fav"]` に保存されている
ユーザーと、ログイン中の自分が表示されます。

## 設定

Tampermonkey のメニューから「AtCoder Sidebar 設定」を開くと、次の項目を変更できます。

- パネルの幅と高さ
- 通常時の更新間隔（初期値 30 秒）
- 自分の提出がジャッジ中の場合の更新間隔（初期値 5 秒）

取得に失敗した場合は 10 秒後に再試行します。表示中のタブだけが更新を行い、
コンテスト終了後は自動更新を停止します。

## データと権限

スクリプトは AtCoder の順位表 JSON を取得し、表示に必要な情報を Tampermonkey の
ストレージへ一時保存します。キャッシュの保持期間は 30 分です。AtCoder 以外の
サービスへデータを送信することはありません。

| 権限 | 用途 |
| --- | --- |
| `GM_xmlhttpRequest` | AtCoder の順位表 JSON の取得 |
| `GM_getValue` / `GM_setValue` | 設定・表示状態・キャッシュの保存 |
| `GM_registerMenuCommand` | 設定画面を開くメニューの追加 |

## 開発者向け

実装は `Base -> Config -> Storage -> API -> Process -> UI -> ACS` の順に継承され、
`window.ACS` として公開されます。他のユーザースクリプトから `@require` で読み込み、
継承して拡張できます。

```javascript
class MyACS extends window.ACS {
    // 必要な処理をオーバーライド
}

new MyACS().ACSinit();
```

ライブラリとしてだけ読み込む場合は、呼び出し元のメタデータに
`@script_id ACS_CORE` を含めないでください。単体インストール時はこの識別子を使って
自動初期化します。

## ライセンス

[MIT License](LICENSE.md) で公開しています。

本ソフトウェアは現状のまま、無保証で提供されます。利用によって生じた損害について、
作者は責任を負いません。
