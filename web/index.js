// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import GDPRWebhookHandlers from "./gdpr.js";

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: GDPRWebhookHandlers })
);

// All endpoints after this point will require an active session
app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

//-------------------------------------------------------------------------------------
const FETCH_ORDERS_QUERY = `{
  orders(first: 10) {
    edges {
      node {
        id
      }
    }
  }
}`



 async function fetchOr(session) {
  const client = new shopify.api.clients.Graphql({ session });

  const res = await client.query({
      data: {
          query: FETCH_ORDERS_QUERY
      }
  })

  return res 

}

//---------------------------------------------------------------------------------------

const FETCH_PRODUCTS_QUERY = `{
  products(first:10) {
    edges {
      node {
        id
        title
      }
    }
  }
}`

 async function fetchProducts(session) {
  const client = new shopify.api.clients.Graphql({ session });

  const res = await client.query({
      data: {
          query: FETCH_PRODUCTS_QUERY
      }
  })

  return res 

}

//---------------------------------------------------------------------------


app.get("/api/products", async (req, res) => {
 

  const products = await fetchProducts(res.locals.shopify.session)

  res.status(200).send({products})

})

//------------------------------------------------------------------------------------------------------- 

app.get("/api/locations", async (req, res) => {


  // const listOrders = await shopify.api.rest.Order.all({
  //   session: res.locals.shopify.session,
  //   status: "any",
  // });

  const locations = await shopify.api.rest.Location.all({
    session: res.locals.shopify.session,
  });

  // const listOrders = await fetchOr(res.locals.shopify.session)
  
  res.status(200).send(locations);
  console.log(locations)
})

//--------------------------------------------------------------------------------------------------------

app.get("/api/products/count", async (_req, res) => {
  const countData = await shopify.api.rest.Product.count({
    session: res.locals.shopify.session,
  });
  res.status(200).send(countData);
});

//-------------------------------------------------------------------------------------------------------

app.get("/api/products/create", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

//---------------------------------------------------------------------------------------------------------

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT);
