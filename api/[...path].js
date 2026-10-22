// Vercel Function: mọi /api/* (trừ /api/telegram) đi qua router dùng chung với dev (xem server/store-api.cjs)
import storeApi from '../server/store-api.cjs'

export default function handler(req, res) {
  return storeApi.api(req, res)
}
