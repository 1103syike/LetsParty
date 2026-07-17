# 派對遊戲 UI 呼叫字卡規範

參考感：瑪利歐派對迷你遊戲的「大聲呼叫」——誇張、好讀、擋畫面少。

排球「就是你的球！！」、隊友舉球提示等 **瞬間注意力文案** 依此規範。

## 必做

1. **無底框**：不要實心背景卡片／pill 蓋在球或場中央（會擋視線）
2. **粗描邊字**：白描邊 + 深色落影，遠看也清楚
3. **字級要大**：主標至少 `text-2xl`／`--font-size-2xl`；重要呼叫可用 `text-3xl`
4. **文案要吵**：短句、驚嘆號、動作感（例：`就是你的球！！`、`接啊接啊！`）
5. **動作要彈**：進場 overshoot／歪一下；可搭配輕微 wobble／bounce
6. **顏色只用 token**：主色 `var(--color-accent)`、強調 `var(--color-warning)`、描邊 `var(--color-on-accent)`、落影 `var(--color-bg)`
7. **文案放 locales**：繁體中文，寫在該遊戲 `locales/zh-TW.ts`

## 建議結構

```html
<div class="…-callout font-game" :class="variant">
  <span class="…-star" aria-hidden="true">★</span>
  <div class="…-body">
    <span class="…-title">{{ title }}</span>
    <span class="…-cue">{{ cue }}</span>
  </div>
  <span class="…-star" aria-hidden="true">★</span>
</div>
```

- 主標 + 副標（可選）
- 左右裝飾星星可選；動畫錯開比較活
- `pointer-events: none`，不要擋操作

## 描邊字參考（scoped SCSS）

```scss
.party-callout-title {
  font-weight: var(--font-weight-bold);
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent);
}
```

## 位置

| 用途 | 建議位置 |
|---|---|
| 球權／接球呼叫 | 畫面上方約 **20%～25%** 水平置中（別貼頂、別蓋球網中央） |
| 舉球／殺球瞬間提示 | 約 **中上 30%～40%**，短暫出現後淡出 |
| 得分／殺球得分 | 約 **中央偏上 35%～42%**；**先彈大比分**（`A : B`），再帶隊伍色文案；紅方用 `--color-player-1`、藍方用 `--color-player-3`（別跟球權的 accent／warning 搞混） |
| 操作說明 | **左下** 純文字清單，不要跟呼叫字搶正中 |

## 不要做

- ❌ 中央大面積半透明底框蓋住球
- ❌ 自創 hex／隨機 px（用 `_variables.scss` token）
- ❌ 把長規則句塞進呼叫字（規則放操作區或 `rules`）
- ❌ 同時堆疊三個以上大型呼叫（會變雜訊）

## 參考實作

- `src/minigames/volleyball/volleyball-play.vue`
  - `.volleyball-play__ball-callout`（球權）
  - `.volleyball-play__teammate-set`（隊友舉球）
  - `.volleyball-play__score-fx`（得分／殺球得分）
