import { getAssetFromKV, mapRequestToAsset } from "@cloudflare/kv-asset-handler";

const headers = new class extends Headers {
  applyTo(response) {
    for (const [key, value] of this.entries()) {
      response.headers.set(key, value);
    }

    return response;
  }
};

self.addEventListener("fetch", event => {
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);
      const hours = 60 * 60;
      const days = 24 * hours;

      // redirect
      if (/\/index.html?$/.test(url.pathname)) {
        return new Response(null, {
          status: 301,
          headers: {
            Location: url.toString().replace(/\/index.html?$/, "")
          }
        });
      }

      const lastPart = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);

      if (lastPart.length && !lastPart.includes(".")) {
        url.pathname = url.pathname.concat(".html");
        return new Response(null, {
          status: 301,
          headers: {
            Location: url.toString()
          }
        });
      }

      // serving files
      try {
        // default
        const options = {
          cacheControl: {
            edgeTtl: 4 * days,
            browserTtl: 4 * days,
            cacheEverything: true
          }
        };

        // headers.set(
        //   "Content-Security-Policy",
        //   "object-src 'none'; script-src https://cdn.jsdelivr.net/* 'sha256-Pmj85ojLaPOWwRtlMJwmezB/Qg8BzvJp5eTzvXaYAfA=' 'unsafe-inline' 'self'; require-trusted-types-for 'script';"
        // );

        // css files
        if (/.css$/.test(url.pathname)) {
          options.cacheControl = {
            edgeTtl: 180 * days,
            browserTtl: 180 * days,
            cacheEverything: true
          };

          headers.set("cache-control", `max-age=${180 * days}`);
        }

        // js files
        if (/.js$/.test(url.pathname)) {
          options.cacheControl = {
            edgeTtl: 2 * days,
            browserTtl: 2 * days,
            cacheEverything: true
          };

          headers.set("cache-control", `max-age=${2 * days}`);
        }

        return headers.applyTo(await getAssetFromKV(event, options));
      } catch (err) {
        const notFoundResponse = await getAssetFromKV(event, {
          mapRequestToAsset: req => new Request(`${url.origin}/404.html`, req),
        });

        return new Response(notFoundResponse.body, { ...notFoundResponse, status: 404 });
      }
    })().catch(err => new Response(
      "Internal Error: ".concat(err.message), { status: 500 }
    ))
  );
});

