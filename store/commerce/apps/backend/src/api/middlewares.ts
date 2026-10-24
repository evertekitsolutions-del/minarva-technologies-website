import {
  configureStoreSearch,
  defineMiddlewares,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
} from '@medusajs/framework/http'
import { publicCheckoutGateFromEnvironment } from '../lib/store-checkout-release'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      method: ["POST"],
      matcher: new RegExp("^/store/carts/[^/]+/complete/?$"),
      middlewares: [
        (_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          if (!publicCheckoutGateFromEnvironment()) {
            return res.status(503).json({
              error: "Customer checkout is not yet available",
            })
          }
          next()
        },
      ],
    },
    {
      method: ["POST"],
      matcher: "/webhooks/cashfree",
      bodyParser: { preserveRawBody: true, sizeLimit: "100kb" },
    },
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
  ],
})
