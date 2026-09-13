// 持ち物チェックリストの既定。堤防からの釣りを想定した最小限。
//
// 🔴 ライフジャケットは先頭に固定し、外せない項目として扱う。
//    海上保安庁は堤防からの釣りでも着用を呼びかけている。

export const GEAR = [
  {
    id: "life",
    label: "ライフジャケット",
    hint: "堤防でも必ず。落ちてからでは着られない",
    must: true,
    group: "安全",
  },
  { id: "shoes", label: "滑りにくい靴", hint: "堤防は濡れると滑る。サンダルは避ける", group: "安全" },
  { id: "light", label: "ヘッドライト", hint: "朝マズメ・夕マズメは暗い。手が塞がらないものを", group: "安全" },
  { id: "phone", label: "スマホと充電", hint: "天気の急変と、万一のときの連絡用", group: "安全" },

  { id: "rod", label: "竿とリール", group: "道具" },
  { id: "rig", label: "仕掛け（予備も）", hint: "根がかりで失う前提で2〜3組", group: "道具" },
  { id: "bait", label: "エサ／ルアー", group: "道具" },
  { id: "scissors", label: "ハサミ・プライヤー", hint: "糸を切る、針を外す", group: "道具" },
  { id: "bucket", label: "水汲みバケツ", hint: "手を洗う、魚を活かす。ロープ付きを", group: "道具" },
  { id: "cooler", label: "クーラーボックスと氷", hint: "持ち帰るなら必須", group: "道具" },
  { id: "towel", label: "タオル", group: "道具" },
  { id: "measure", label: "メジャー", hint: "小さすぎる魚は逃がすため", group: "道具" },

  { id: "drink", label: "飲み物", hint: "夏は多めに。自販機が無い場所が多い", group: "身のまわり" },
  { id: "hat", label: "帽子", group: "身のまわり" },
  { id: "glasses", label: "偏光グラス", hint: "水中が見える。飛んでくる仕掛けから目も守る", group: "身のまわり" },
  { id: "sunscreen", label: "日焼け止め", group: "身のまわり" },
  { id: "raincoat", label: "雨具・防寒", hint: "海の上は陸より風が冷たい", group: "身のまわり" },
  { id: "trash", label: "ゴミ袋", hint: "切った糸は必ず持ち帰る", group: "身のまわり" },
];

export const GEAR_GROUPS = ["安全", "道具", "身のまわり"];
