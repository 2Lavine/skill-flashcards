# 今日复盘接口

同一枚 Personal Integration Token（`x-api-key` 或 `Authorization: Bearer`）。四个 GET 都要 `stats:read`。已有令牌只要带 `stats:read` 就能用，不必为这个技能另开权限。

默认地址 `https://sourcard.sourmonkey.xyz`。`SOURCARDS_API_BASE_URL` 覆盖。

## 调用

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/stats?localDay=` | `today`、`totalReviews`、`avgDaily30`、库存 `total/due/new/learning/review`、`avgDifficulty` |
| GET | `/api/daily-counts?days=N&localDay=` | `{ daily: [{ label, date, count }] }` |
| GET | `/api/streak?localDay=` | `{ streak }` |
| GET | `/api/review-logs?localDay=&tzOffsetMinutes=&limit=&cursor=` | 该本地日的复习行，每页最多 100，默认 50 |

`tzOffsetMinutes` 是当地相对 UTC 的分钟，向东为正。中国 `480`。不传按 UTC。`localDay` 不传则按服务器 UTC 当天。

`review-logs` 成功体：

```json
{
  "localDay": "2026-10-28",
  "tzOffsetMinutes": 480,
  "logs": [
    {
      "id": 12,
      "cardId": "…",
      "rating": 1,
      "state": 2,
      "review": "2026-10-28T01:12:00.000Z",
      "question": "题面",
      "questionTruncated": false,
      "category": "概率论",
      "deck": "数学"
    }
  ],
  "nextCursor": null
}
```

`rating`：1 Again，2 Hard，3 Good，4 Easy。`state`：0 New，1 Learning，2 Review，3 Relearning。没有 `answer`。题面长于 2000 字时截断并 `questionTruncated: true`。`nextCursor` 非空就原样传回 `cursor`，直到 null。

已删除的卡片不会出现在 `logs` 里。

## 配额

每次请求计 1 次。一次复盘 ≈ 3 + 页数。Free 100/天，Lite / Lifetime 5000/天。响应头 `X-RateLimit-Limit` / `X-RateLimit-Remaining`。429 停止，不要紧接着重试。

## 错误

| HTTP | 含义 |
|------|------|
| 401 | token 无效或没有 `stats:read` |
| 400 | `invalid_local_day` / `invalid_tz_offset` / `invalid_cursor` |
| 404 | 这个部署还没有 `/api/review-logs` |
| 429 | 当日配额用完 |

## 拿不到的

番茄钟事件、单卡耗时、答案、整库卡片列表、Coach、设置。
