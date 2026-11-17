/** GraphQL Admin API documents (API version configured via SHOPIFY_API_VERSION). */
export const Q = {
  shop: `query { shop { name myshopifyDomain currencyCode } currentAppInstallation { accessScopes { handle } } }`,
  products: `query Products($first: Int!, $query: String) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes { id title handle status totalInventory updatedAt productType tags
        featuredMedia { preview { image { url } } }
        priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount } } }
    } }`,
  product: `query Product($id: ID!) {
    product(id: $id) { id title handle status descriptionHtml productType vendor tags seo { title description }
      variants(first: 100) { nodes { id title price compareAtPrice sku } } } }`,
  collections: `query { collections(first: 50, sortKey: UPDATED_AT, reverse: true) { nodes { id title handle productsCount { count } } } }`,
  themes: `query { themes(first: 20) { nodes { id name role updatedAt } } }`,
  themeFiles: `query ThemeFiles($id: ID!, $filenames: [String!]) {
    theme(id: $id) { id name role
      files(filenames: $filenames, first: 50) { nodes { filename checksumMd5 size
        body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`,
  themeFileList: `query ThemeFileList($id: ID!) { theme(id: $id) { id name role files(first: 250) { nodes { filename size } } } }`,
  orders: `query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { id name createdAt cancelledAt
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 50) { nodes { quantity product { id } originalTotalSet { shopMoney { amount } } } }
        refunds { createdAt refundLineItems(first: 50) { nodes { quantity lineItem { product { id } } subtotalSet { shopMoney { amount } } } } } }
    } }`,
};

export const M = {
  productCreate: `mutation ProductCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product { id handle status variants(first: 1) { nodes { id } } }
      userErrors { field message } } }`,
  variantsBulkCreate: `mutation VariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) { productVariants { id } userErrors { field message } } }`,
  variantsBulkUpdate: `mutation VariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id price compareAtPrice } userErrors { field message } } }`,
  productUpdate: `mutation ProductUpdate($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id status } userErrors { field message } } }`,
  productDelete: `mutation ProductDelete($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`,
  collectionCreate: `mutation CollectionCreate($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
  collectionAddProducts: `mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } } }`,
  collectionDelete: `mutation CollectionDelete($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }`,
  pageCreate: `mutation PageCreate($page: PageCreateInput!) { pageCreate(page: $page) { page { id handle } userErrors { field message } } }`,
  pageDelete: `mutation PageDelete($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { field message } } }`,
  themeFilesUpsert: `mutation ThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } job { id } userErrors { filename code message } } }`,
  themeFilesDelete: `mutation ThemeFilesDelete($themeId: ID!, $files: [String!]!) {
    themeFilesDelete(themeId: $themeId, files: $files) { deletedThemeFiles { filename } userErrors { filename code message } } }`,
};

/** Scopes the integration uses and what each enables. */
export const SCOPES: Array<{ handle: string; alt?: string; purpose: string; required: boolean }> = [
  { handle: "read_products", purpose: "Read products for listings and sales mapping", required: true },
  { handle: "write_products", purpose: "Create draft products, update listings and prices (always after your confirmation)", required: true },
  { handle: "read_orders", purpose: "Read orders, revenue and refunds for testing results (last 60 days)", required: true },
  { handle: "read_themes", purpose: "Read theme files to preview and back up before changes", required: false },
  { handle: "write_themes", purpose: "Add landing-page sections/templates to a theme (after confirmation)", required: false },
  { handle: "read_content", alt: "read_online_store_pages", purpose: "Read pages", required: false },
  { handle: "write_content", alt: "write_online_store_pages", purpose: "Create landing pages (unpublished by default)", required: false },
];
