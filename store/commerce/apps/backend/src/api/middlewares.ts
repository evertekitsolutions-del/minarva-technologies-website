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
      // Global route middleware runs BEFORE Medusa route-body validation;
      // method-scoped middleware can be bypassed by request validation.
      // Exact anchored matcher avoids affecting other Store routes.
      matcher: new RegExp("^/store/carts/[^/]+/complete/?$", "i"),
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          if (req.method === "POST" && !publicCheckoutGateFromEnvironment()) {
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
            // Medusa combines this server-owned constraint with any client
            // filters via AND; a buyer cannot query unpublished/unapproved kits.
            product: {
              filters: () => ({ sale_approved: true }),
            },
          },
        }),
      ],
    },
  ],
})
