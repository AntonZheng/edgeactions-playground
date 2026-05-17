import type { EdgeActionEvent, OriginMockResponse } from "../types/edge-actions";
import { defaultEdgeActionEvent, HookPoint } from "../types/edge-actions";

export interface Template {
  name: string;
  description: string;
  category: "official";
  code: string;
  input: EdgeActionEvent;
  kvs?: Record<string, string>;
  originMocks?: Record<number, OriginMockResponse>;
}

export const templates: Template[] = [
  // ===== OFFICIAL SAMPLES (from Azure/EdgeActionsSamples) =====
  {
    name: "Header Add",
    category: "official",
    description: "Add a custom response header — from Azure/EdgeActionsSamples",
    code: `// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const response = event.response;
    
    // Manually set response code to 200, as part of adding new header
    response.response_code = 200;

    // Add a custom header to the response
    response.headers['x-customheader'] = "processedByEdgeactions";

    console.log("Added custom header: x-customheader = processedByEdgeactions");

    return event;
}`,
    input: {
      ...defaultEdgeActionEvent(),
      hook_point: HookPoint.ClientRequest,
      request: {
        ...defaultEdgeActionEvent().request,
        uri: "/api/data",
        headers: {
          host: "myapp.azurefd.net",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          accept: "application/json",
        },
      },
      response: {
        response_code: 200,
        headers: {
          "content-type": "application/json",
          "server": "nginx/1.25",
        },
        body: '{"status": "ok"}',
        set_cookie_headers: [],
      },
    },
    originMocks: {
      0: {
        statusCode: 200,
        headers: { "content-type": "application/json", "server": "nginx/1.25" },
        body: '{"status": "ok", "data": "Hello from origin"}',
      },
      1: {
        statusCode: 200,
        headers: { "content-type": "application/json", "server": "nginx/1.25" },
        body: '{"status": "ok", "data": "Hello from West US"}',
      },
    },
  },
  {
    name: "Request Rejection",
    category: "official",
    description: "Reject requests from specific countries with 403 — from Azure/EdgeActionsSamples",
    code: `// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    var response = event.response;
    var request = event.request;
    var context = event.context || {};

    // Extract country code from context
    const country = context.country_code || 'default';

    // Reject requests from UK
    if (country.toUpperCase() === 'GB') {
        console.log("Request rejected from UK with code 403");
        response.response_code = 403;
        response.headers['X-Request-Rejected'] = "true";
    }

    return event;
}`,
    input: {
      ...defaultEdgeActionEvent(),
      request: {
        ...defaultEdgeActionEvent().request,
        uri: "/api/protected",
        headers: {
          host: "api.myapp.azurefd.net",
          accept: "application/json",
          "user-agent": "Mozilla/5.0",
        },
      },
      context: {
        country_code: "GB",
      },
    },
    originMocks: {
      0: {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: '{"message": "This should not be reached for blocked countries"}',
      },
      1: {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: '{"message": "Response from West US"}',
      },
    },
  },
  {
    name: "Origin Selection",
    category: "official",
    description: "Route requests to geo-specific origins based on country — from Azure/EdgeActionsSamples",
    code: `// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const response = event.response;
    const request = event.request;
    const context = event.context || {};
    const country = context.country_code || 'default';

    console.log(\`Incoming request from country: \${country}\`);

    // Check if origin_data is available
    if (!event.origin_data || event.origin_data.length === 0) {
        console.log("No origins found in origin_data");
        response.headers['X-Origin-Error'] = "No origins available";
        return event;
    }

    let selectedOrigin = null;

    // Route to a specific origin if the request is from the US
    if (country.toUpperCase() === 'US') {
        selectedOrigin = event.origin_data.find(origin =>
            origin.name && origin.name.toLowerCase().includes('us')
        );
        if (selectedOrigin) {
            console.log("Routing to US-specific origin");
        }
    }

    // Fallback to the first available origin
    if (!selectedOrigin) {
        selectedOrigin = event.origin_data[0];
        console.log("Using default origin as fallback");
    }

    event.origin.id = selectedOrigin.id;
    response.headers['X-Selected-Origin'] = selectedOrigin.name;
    response.headers['X-Country'] = country;

    return event;
}`,
    input: {
      ...defaultEdgeActionEvent(),
      request: {
        ...defaultEdgeActionEvent().request,
        uri: "/app/dashboard",
        headers: {
          host: "myapp.azurefd.net",
          accept: "text/html",
          "user-agent": "Mozilla/5.0",
        },
      },
      origin_data: [
        { id: 0, name: "us.origin.com", weight: 100, priority: 1, is_healthy: true },
        { id: 1, name: "eu.origin.com", weight: 100, priority: 1, is_healthy: true },
        { id: 2, name: "asia.origin.com", weight: 80, priority: 2, is_healthy: true },
      ],
      context: {
        country_code: "US",
      },
    },
    originMocks: {
      0: {
        statusCode: 200,
        headers: { "content-type": "text/html", "server": "nginx/1.25", "x-region": "us" },
        body: "<html><body><h1>Hello from US origin</h1></body></html>",
      },
      1: {
        statusCode: 200,
        headers: { "content-type": "text/html", "server": "nginx/1.25", "x-region": "eu" },
        body: "<html><body><h1>Hello from EU origin</h1></body></html>",
      },
      2: {
        statusCode: 200,
        headers: { "content-type": "text/html", "server": "nginx/1.25", "x-region": "asia" },
        body: "<html><body><h1>Hello from Asia origin</h1></body></html>",
      },
    },
  },
  {
    name: "A/B Experimentation",
    category: "official",
    description: "Route opted-in mobile traffic to experimental origin — from Azure/EdgeActionsSamples",
    code: `// @ts-check

/**
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    var response = event.response;
    var request = event.request;
    var context = event.context || {};

    // check if there are any origins available.
    if (!event.origin_data || event.origin_data.length === 0) {
        console.log("No origin data found, skipping origin selection.\\n");
        return event;
    }

    if(context['is_mobile'] !== '1' || request.headers['x-allow-experiment'] !== 'true') {
        // if the request is non mobile or not opted in with header, let AFD choose origin.
        console.log("Request is not from an opted in mobile device, bypassing origin selection.\\n");
        return event;
    }
    
    var experimentalOrigin = findExperimentalOrigin(event.origin_data);
    if (!experimentalOrigin) {
        console.log("No experimental origin found, skipping origin selection.\\n");
        return event;
    }

    event.origin.id = experimentalOrigin.id;

    return event;
}

/**
 * Finds an experimental origin by name patterns
 * @param {Array<import("./edge_actions").CdnOrigin>} origins - Array of origin objects
 * @returns {import("./edge_actions").CdnOrigin|null} - Found experimental origin or null
 */
function findExperimentalOrigin(origins) {
    const found = origins.find(origin => {
        if (!origin.name) return false;
        const name = origin.name.toLowerCase();
        const includes = name.includes('experimental');
        console.log(\`Checking origin \${origin.id}: \${name} - Includes 'experimental'? \${includes}\\n\`);
        return includes;
    });
    
    console.log(\`Selected experimental origin: \${found ? found.id : 'none'}\\n\`);
    return found || null;
}`,
    input: {
      ...defaultEdgeActionEvent(),
      request: {
        ...defaultEdgeActionEvent().request,
        uri: "/app/home",
        headers: {
          host: "myapp.azurefd.net",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          accept: "text/html",
          "x-allow-experiment": "true",
        },
      },
      origin_data: [
        { id: 0, name: "normal.origin.com", weight: 1000, priority: 1, is_healthy: true },
        { id: 1, name: "experimental.origin.com", weight: 1, priority: 2, is_healthy: true },
      ],
      context: {
        is_mobile: "1",
      },
    },
    originMocks: {
      0: {
        statusCode: 200,
        headers: { "content-type": "text/html", "x-version": "v2-stable" },
        body: "<html><body><h1>Production App</h1></body></html>",
      },
      1: {
        statusCode: 200,
        headers: { "content-type": "text/html", "x-version": "v3-experimental" },
        body: "<html><body><h1>Experimental App 🧪</h1><p>New features enabled!</p></body></html>",
      },
    },
  },
  {
    name: "URL Rewrite",
    category: "official",
    description: "Rewrite URLs using regex — blog paths, products, trailing slashes, UTM cleanup — from Azure/EdgeActionsSamples",
    code: `// @ts-check

/**
 * URL Rewrite Edge Action using Regular Expressions
 * 
 * This function demonstrates various URL rewriting patterns using regex:
 * 1. Redirecting old paths to new paths
 * 2. Removing trailing slashes
 * 3. Converting old product URLs to new format
 * 4. Query parameter manipulation
 * 
 * @param {import("./edge_actions").EdgeActionEvent} event - The event object containing request and response
 * @returns {import("./edge_actions").EdgeActionEvent} - The modified event object
 */
function handler(event) {
    const request = event.request;
    let uri = request.uri;
    let queryString = request.query_string;
    
    console.log(\`Original URI: \${uri}, Query: \${queryString}\`);
    
    // Example 1: Rewrite /old-blog/* to /blog/*
    // Pattern: /old-blog/article-name -> /blog/article-name
    const oldBlogPattern = /^\\/old-blog\\/(.*)$/;
    if (oldBlogPattern.test(uri)) {
        uri = uri.replace(oldBlogPattern, '/blog/$1');
        console.log(\`Rewrote old-blog path to: \${uri}\`);
    }
    
    // Example 2: Remove trailing slashes (except for root /)
    // Pattern: /path/to/page/ -> /path/to/page
    const trailingSlashPattern = /^(.+)\\/$/;
    if (trailingSlashPattern.test(uri)) {
        uri = uri.replace(trailingSlashPattern, '$1');
        console.log(\`Removed trailing slash: \${uri}\`);
    }
    
    // Example 3: Rewrite product URLs from old format to new format
    // Pattern: /products/item/123 -> /shop/product-123
    const oldProductPattern = /^\\/products\\/item\\/(\\d+)$/;
    if (oldProductPattern.test(uri)) {
        uri = uri.replace(oldProductPattern, '/shop/product-$1');
        console.log(\`Rewrote product URL to: \${uri}\`);
    }
    
    // Example 4: Convert category pages
    // Pattern: /category/electronics/subcategory/phones -> /c/electronics/phones
    const categoryPattern = /^\\/category\\/([^\\/]+)\\/subcategory\\/([^\\/]+)$/;
    if (categoryPattern.test(uri)) {
        uri = uri.replace(categoryPattern, '/c/$1/$2');
        console.log(\`Rewrote category URL to: \${uri}\`);
    }
    
    // Example 5: Normalize file extensions
    // Pattern: /page.html -> /page
    const htmlExtPattern = /^(.*)\\.html?$/;
    if (htmlExtPattern.test(uri)) {
        uri = uri.replace(htmlExtPattern, '$1');
        console.log(\`Removed HTML extension: \${uri}\`);
    }
    
    // Example 6: Query string manipulation
    // Remove tracking parameters (utm_* parameters)
    if (queryString) {
        const pairs = queryString.split('&');
        const filteredPairs = [];
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const key = pair.split('=')[0];
            // Keep only non-utm parameters
            if (!/^utm_/.test(key)) {
                filteredPairs.push(pair);
            }
        }
        
        queryString = filteredPairs.join('&');
        console.log(\`Cleaned query string: \${queryString}\`);
    }
    
    // Apply the rewritten URI and query string
    request.uri = uri;
    request.query_string = queryString;
    
    console.log(\`Final URI: \${uri}, Final Query: \${queryString}\`);
    
    return event;
}`,
    input: {
      ...defaultEdgeActionEvent(),
      request: {
        uri: "/old-blog/my-article/",
        method: "GET",
        query_string: "page=1&utm_source=twitter&utm_medium=social&ref=homepage",
        headers: {
          host: "mysite.azurefd.net",
          "user-agent": "Mozilla/5.0",
          accept: "text/html",
        },
        body: "",
      },
    },
    originMocks: {
      0: {
        statusCode: 200,
        headers: { "content-type": "text/html", "server": "nginx/1.25" },
        body: "<html><body><h1>Blog Article</h1><p>Content here...</p></body></html>",
      },
      1: {
        statusCode: 200,
        headers: { "content-type": "text/html", "server": "nginx/1.25" },
        body: "<html><body><h1>Blog Article (West US)</h1></body></html>",
      },
    },
  },

];

export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  official: { label: "Official Samples", icon: "🏢" },
};
