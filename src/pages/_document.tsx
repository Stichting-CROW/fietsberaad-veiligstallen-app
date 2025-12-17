import Document, { Html, Head, Main, NextScript } from "next/document";

class MainDocument extends Document {
  static async getInitialProps(ctx: any) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <Html>
        <Head>
          <title>VeiligStallen - Nederlandse fietsenstallingen</title>
          <meta name="title" content="VeiligStallen - Nederlandse fietsenstallingen" />
          <meta name="description" content="Waar is een goede/veilige/overdekte plek voor je fiets? Bekijk het op VeiligStallen.nl" />

          <meta name="viewport" content="initial-scale=1, width=device-width" />

          <meta name="application-name" content="VeiligStallen" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="default"
          />
          <meta name="apple-mobile-web-app-title" content="VeiligStallen" />
          <meta property="twitter:description" content="Waar is een goede/veilige/overdekte plek voor je fiets? Bekijk het op VeiligStallen.nl" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          {/*<meta name="msapplication-config" content="/icons/browserconfig.xml" />*/}
          <meta name="msapplication-TileColor" content="#15AEEF" />
          <meta name="msapplication-tap-highlight" content="no" />
          <meta name="theme-color" content="#000000" />

          <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
          <link
            rel="apple-touch-icon"
            sizes="152x152"
            href="/icons/touch-icon-ipad.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/icons/touch-icon-iphone-retina.png"
          />
          <link
            rel="apple-touch-icon"
            sizes="167x167"
            href="/icons/touch-icon-ipad-retina.png"
          />

          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/icons/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/icons/favicon-16x16.png"
          />
          <link rel="manifest" href="/manifest.json" />
          {/*<link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5bbad5" />*/}
          <link rel="shortcut icon" href="/favicon.ico" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css?family=Roboto:300,400,500"
          />

          <meta property="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content="https://beta.veiligstallen.nl" />
          <meta property="twitter:title" content="VeiligStallen - Nederlandse fietsenstallingen" />
          <meta
            name="twitter:description"
            content="De kortste weg naar een veilige plek voor uw fiets"
          />
          <meta
            name="twitter:image"
            content="https://beta.veiligstallen.nl/icons/preview-image.png"
          />
          <meta name="twitter:creator" content="@verkeer_vervoer" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="VeiligStallen - Nederlandse fietsenstallingen" />
          <meta property="og:description" content="Waar is een goede/veilige/overdekte plek voor je fiets? Bekijk het op VeiligStallen.nl" />
          <meta property="og:site_name" content="VeiligStallen" />
          <meta property="og:url" content="https://beta.veiligstallen.nl" />
          <meta property="og:image" content="https://beta.veiligstallen.nl/icons/preview-image.png" />

          <link
            href="/icons/splashscreens-ios/iphone5_splash.png"
            media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/iphone6_splash.png"
            media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/iphoneplus_splash.png"
            media="(device-width: 621px) and (device-height: 1104px) and (-webkit-device-pixel-ratio: 3)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/iphonex_splash.png"
            media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/iphonexr_splash.png"
            media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/iphonexsmax_splash.png"
            media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/ipad_splash.png"
            media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/ipadpro1_splash.png"
            media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/ipadpro3_splash.png"
            media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />
          <link
            href="/icons/splashscreens-ios/ipadpro2_splash.png"
            media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
            rel="apple-touch-startup-image"
          />

          {/* Matomo website analytics - only in production */}
          {process.env.NODE_ENV === 'production' && process.env.MATOMO_URL && (
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  var _paq = window._paq = window._paq || [];
                  /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
                  _paq.push(["setDoNotTrack", true]);
                  _paq.push(['trackPageView']);
                  _paq.push(['enableLinkTracking']);
                  (function() {
                    var u="https://${process.env.MATOMO_URL}/";
                    _paq.push(['setTrackerUrl', u+'matomo.php']);
                    _paq.push(['setSiteId', '1']);
                    var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
                    g.async=true; g.src='https://cdn.matomo.cloud/${process.env.MATOMO_URL}/matomo.js'; s.parentNode.insertBefore(g,s);
                  })();
                `,
              }}
            />
          )}

          {/* <!-- apple splash screen images -->
          <link rel='apple-touch-startup-image' href='/images/apple_splash_2048.png' sizes='2048x2732' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_1668.png' sizes='1668x2224' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_1536.png' sizes='1536x2048' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_1125.png' sizes='1125x2436' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_1242.png' sizes='1242x2208' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_750.png' sizes='750x1334' />
          <link rel='apple-touch-startup-image' href='/images/apple_splash_640.png' sizes='640x1136' />
          */}
        </Head>
        <body>
          <Main />
          <NextScript />
          <div id="modal-root" className="z-20"></div>
          <div id="overlay-root" className="z-20 fixed top-0 h-full overflow-auto"></div>
        </body>
      </Html>
    );
  }
}

export default MainDocument;
