import {
  configureStoreSearch,
  defineMiddlewares,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
} from '@medusajs/framework/http'
import {
  publicCheckoutGateFromEnvironment,
  shouldBlockPublicCartMutation,
} from '../lib/store-checkout-release'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      // STORE-023: disable ALL customer-facing cart mutation endpoints by
      // default, not only final completion. Static product/cart GETs continue
      // to work and Medusa Admin endpoints are not affected.
      // Broad match includes /store/carts, /store/carts/:id/line-items,
      // shipping options, promotions and every other nested cart mutation.
      matcher: new RegExp("^/store/carts(?:/.*)?$", "i"),
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          if (shouldBlockPublicCartMutation({
            method: req.method,
            path: req.path,
            sandboxAuthorized: publicCheckoutGateFromEnvironment(),
          })) {
            return res.status(503).json({
              error: "Customer cart and checkout are not yet available",
            })
          }
          next()
        },
      ],
    },
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
            product: true,
          },
        }),
      ],
    },
  ],
})
