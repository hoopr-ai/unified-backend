/**
 * Instagram Media Extractor
 * Extracts media URLs from Instagram
 * Uses multiple methods: RapidAPI, Puppeteer, oEmbed API, GraphQL, and page parsing
 * Supports authenticated requests via session cookies for profile access
 */

import fs from "fs";
import puppeteer from "puppeteer";

// Instagram session configuration from environment
const getInstagramSession = (): { sessionId: string; csrfToken: string; dsUserId: string } | null => {
  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  const csrfToken = process.env.INSTAGRAM_CSRF_TOKEN;
  const dsUserId = process.env.INSTAGRAM_DS_USER_ID;

  if (sessionId && csrfToken) {
    return { sessionId, csrfToken, dsUserId: dsUserId || "" };
  }
  return null;
};

// Build cookie header for authenticated requests
const buildCookieHeader = (): string | null => {
  const session = getInstagramSession();
  if (!session) return null;

  const cookies = [
    `sessionid=${session.sessionId}`,
    `csrftoken=${session.csrfToken}`,
    `ds_user_id=${session.dsUserId}`,
    "ig_did=placeholder",
    "ig_nrcb=1",
  ];
  return cookies.join("; ");
};

// Build authenticated headers for Instagram API requests
const buildAuthHeaders = (): Record<string, string> => {
  const session = getInstagramSession();
  const cookieHeader = buildCookieHeader();

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-IG-App-ID": "936619743392459",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };

  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  if (session?.csrfToken) {
    headers["X-CSRFToken"] = session.csrfToken;
  }

  return headers;
};

// ============================================================
// RAPIDAPI INSTAGRAM SCRAPER
// ============================================================

interface RapidAPIConfig {
  apiKey: string;
  apiHost: string;
}

const getRapidAPIConfig = (): RapidAPIConfig | null => {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    apiHost: "instagram-api-fast-reliable-data-scraper.p.rapidapi.com",
  };
};

interface RapidAPIProfileResponse {
  data?: {
    id: string;
    username: string;
    full_name: string;
    biography: string;
    profile_pic_url: string;
    profile_pic_url_hd: string;
    media_count: number;
    follower_count: number;
    following_count: number;
    is_private: boolean;
  };
  status?: string;
  message?: string;
}

interface RapidAPIReelItem {
  id: string;
  code: string;
  taken_at: number;
  video_url?: string;
  thumbnail_url?: string;
  caption?: { text: string };
  video_duration?: number;
  play_count?: number;
  like_count?: number;
}

interface RapidAPIReelsResponse {
  data?: {
    items: RapidAPIReelItem[];
    paging_info?: { max_id: string; more_available: boolean };
  };
  status?: string;
  message?: string;
}

// Fetch profile info via RapidAPI
const fetchProfileViaRapidAPI = async (username: string): Promise<{
  profile: {
    username: string;
    full_name?: string;
    biography?: string;
    profile_pic?: string;
    post_count?: number;
    follower_count?: number;
    following_count?: number;
  };
  userId: string;
} | null> => {
  const config = getRapidAPIConfig();
  if (!config) {
    console.log("  RapidAPI key not configured");
    return null;
  }
  console.log(username);
  

  try {
    console.log("  Trying RapidAPI profile endpoint...");
    const response = await fetch(
      `https://${config.apiHost}/profile?username=${encodeURIComponent(username)}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": config.apiKey,
          "x-rapidapi-host": config.apiHost,
        },
      }
    );

    //SAVE RESPONSE FOR DEBUGGING in text file
    fs.writeFileSync(`rapidapi_profile_response_${username}.txt`, await response.text());

    if (!response.ok) {
      console.log(`  RapidAPI profile failed` + JSON.stringify(await response.json()));
      return null;
    }

    const data: RapidAPIProfileResponse = await response.json();

    if (!data.data) {
      console.log("  RapidAPI returned no profile data");
      return null;
    }

    console.log(`  ✅ RapidAPI profile success for @${username}`);
    return {
      profile: {
        username: data.data.username,
        full_name: data.data.full_name,
        biography: data.data.biography,
        profile_pic: data.data.profile_pic_url_hd || data.data.profile_pic_url,
        post_count: data.data.media_count,
        follower_count: data.data.follower_count,
        following_count: data.data.following_count,
      },
      userId: data.data.id,
    };
  } catch (error) {
    console.log("  RapidAPI profile error:", error);
    return null;
  }
};

// Fetch reels via RapidAPI
const fetchReelsViaRapidAPI = async (
  username: string,
  limit: number = 10
): Promise<Array<{
  shortcode: string;
  url: string;
  video_url: string;
  thumbnail: string;
  caption?: string;
  duration?: number;
}> | null> => {
  const config = getRapidAPIConfig();
  if (!config) return null;

  try {
    console.log(`  Trying RapidAPI reels endpoint for @${username}...`);
    const response = await fetch(
      `https://${config.apiHost}/reels?username=${encodeURIComponent(username)}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": config.apiKey,
          "x-rapidapi-host": config.apiHost,
        },
      }
    );

    if (!response.ok) {
      console.log(`  RapidAPI reels failed: ${response.status}`);
      return null;
    }

    const data: RapidAPIReelsResponse = await response.json();

    if (!data.data?.items || data.data.items.length === 0) {
      console.log("  RapidAPI returned no reels");
      return null;
    }

    const reels = data.data.items.slice(0, limit).map((item) => ({
      shortcode: item.code,
      url: `https://www.instagram.com/reel/${item.code}/`,
      video_url: item.video_url || "",
      thumbnail: item.thumbnail_url || "",
      caption: item.caption?.text,
      duration: item.video_duration,
    }));

    console.log(`  ✅ RapidAPI found ${reels.length} reels`);
    return reels;
  } catch (error) {
    console.log("  RapidAPI reels error:", error);
    return null;
  }
};

// Combined function to get profile + reels via RapidAPI
const fetchProfileAndReelsViaRapidAPI = async (
  username: string,
  reelsLimit: number = 10
): Promise<{
  profile: {
    username: string;
    full_name?: string;
    biography?: string;
    profile_pic?: string;
    post_count?: number;
    follower_count?: number;
    following_count?: number;
  };
  reels: Array<{
    shortcode: string;
    url: string;
    video_url: string;
    thumbnail: string;
    caption?: string;
    duration?: number;
  }>;
} | null> => {
  // Get profile first
  const profileResult = await fetchProfileViaRapidAPI(username);
  if (!profileResult) return null;

  // Get reels
  const reels = await fetchReelsViaRapidAPI(username, reelsLimit);
  if (!reels) {
    // Return profile with empty reels if reels fetch fails
    return { profile: profileResult.profile, reels: [] };
  }

  return { profile: profileResult.profile, reels };
};

// ============================================================
// PUPPETEER FALLBACK FOR PROFILE SCRAPING
// ============================================================

interface PuppeteerReelData {
  shortcode: string;
  url: string;
  video_url: string;
  thumbnail: string;
  caption?: string;
}

// Fetch profile reels using Puppeteer browser automation
const fetchProfileViaPuppeteer = async (
  username: string,
  limit: number = 10
): Promise<{
  profile: {
    username: string;
    full_name?: string;
    biography?: string;
    profile_pic?: string;
  };
  reels: PuppeteerReelData[];
} | null> => {
  let browser = null;

  try {
    console.log(`  Trying Puppeteer for @${username}...`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Add session cookies if available
    const session = getInstagramSession();
    if (session) {
      await page.setCookie(
        { name: "sessionid", value: session.sessionId, domain: ".instagram.com" },
        { name: "csrftoken", value: session.csrfToken, domain: ".instagram.com" },
        { name: "ds_user_id", value: session.dsUserId, domain: ".instagram.com" }
      );
    }

    // Navigate to reels tab
    const reelsUrl = `https://www.instagram.com/${username}/reels/`;
    await page.goto(reelsUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for content to load
    await page.waitForSelector("article", { timeout: 10000 }).catch(() => null);

    // Scroll to load more content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Extract reel links and data
    const reelData = await page.evaluate((maxReels: number) => {
      const reels: Array<{ shortcode: string; url: string; thumbnail: string }> = [];
      const seen = new Set<string>();

      // Find all reel links
      const links = document.querySelectorAll('a[href*="/reel/"]');
      for (const link of links) {
        if (reels.length >= maxReels) break;

        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/\/reel\/([A-Za-z0-9_-]+)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);

          // Try to get thumbnail
          const img = link.querySelector("img");
          const thumbnail = img?.src || "";

          reels.push({
            shortcode: match[1],
            url: `https://www.instagram.com/reel/${match[1]}/`,
            thumbnail,
          });
        }
      }

      return reels;
    }, limit);

    // Extract profile info
    const profileInfo = await page.evaluate(() => {
      const usernameEl = document.querySelector('header h2, header span[dir="auto"]');
      const bioEl = document.querySelector('header section > div > span');
      const nameEl = document.querySelector('header section span[dir="auto"]');

      return {
        username: usernameEl?.textContent || "",
        full_name: nameEl?.textContent || "",
        biography: bioEl?.textContent || "",
      };
    });

    await browser.close();

    if (reelData.length === 0) {
      console.log("  Puppeteer found no reels");
      return null;
    }

    console.log(`  ✅ Puppeteer found ${reelData.length} reels`);

    // Now fetch video URLs for each reel
    const reelsWithVideos: PuppeteerReelData[] = [];

    for (const reel of reelData.slice(0, limit)) {
      try {
        // Use existing extractInstagramMedia to get video URL
        const media = await extractInstagramMedia(reel.url);
        reelsWithVideos.push({
          shortcode: reel.shortcode,
          url: reel.url,
          video_url: media.video_url,
          thumbnail: reel.thumbnail || media.thumbnail,
          caption: media.title,
        });
      } catch (e) {
        console.log(`  Failed to extract video for ${reel.shortcode}`);
      }
    }

    return {
      profile: {
        username: profileInfo.username || username,
        full_name: profileInfo.full_name,
        biography: profileInfo.biography,
      },
      reels: reelsWithVideos,
    };
  } catch (error) {
    console.log("  Puppeteer error:", error);
    if (browser) {
      await browser.close();
    }
    return null;
  }
};

export interface InstagramMedia {
  title: string;
  video_url: string;
  thumbnail: string;
  duration?: number;
  author?: string;
  type: "video" | "image" | "carousel";
  formats?: Array<{
    format_id: string;
    ext: string;
    url: string;
    quality?: string;
  }>;
}

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
}

interface GraphQLMedia {
  __typename: string;
  id: string;
  shortcode: string;
  display_url: string;
  video_url?: string;
  is_video: boolean;
  edge_sidecar_to_children?: {
    edges: Array<{
      node: {
        display_url: string;
        video_url?: string;
        is_video: boolean;
      };
    }>;
  };
  edge_media_to_caption?: {
    edges: Array<{
      node: {
        text: string;
      };
    }>;
  };
  owner?: {
    username: string;
  };
  video_duration?: number;
}

// Extract shortcode from Instagram URL
const extractShortcode = (url: string): string | null => {
  const patterns = [
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reels\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
};

// Method 1: Try Instagram oEmbed API (works for public posts)
const tryOEmbed = async (url: string): Promise<Partial<InstagramMedia> | null> => {
  try {
    const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;

    const response = await fetch(oembedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.log(`oEmbed failed with status: ${response.status}`);
      return null;
    }

    const data: OEmbedResponse = await response.json();

    return {
      title: data.title || "Instagram Post",
      thumbnail: data.thumbnail_url,
      author: data.author_name,
    };
  } catch (error) {
    console.log("oEmbed method failed:", error);
    return null;
  }
};

// Method 2: Try to extract from Instagram's GraphQL API
const tryGraphQL = async (shortcode: string): Promise<InstagramMedia | null> => {
  try {
    // Instagram's public GraphQL endpoint for media
    const graphqlUrl = `https://www.instagram.com/api/v1/media/${shortcode}/info/`;

    const response = await fetch(graphqlUrl, {
      headers: {
        "User-Agent": "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)",
        "Accept": "*/*",
        "X-IG-App-ID": "936619743392459",
      },
    });

    if (!response.ok) {
      console.log(`GraphQL API failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const item = data.items?.[0];

    if (!item) return null;

    // Extract video URL
    let videoUrl = "";
    let thumbnail = "";
    let type: "video" | "image" | "carousel" = "image";

    if (item.video_versions && item.video_versions.length > 0) {
      videoUrl = item.video_versions[0].url;
      type = "video";
    }

    if (item.image_versions2?.candidates?.length > 0) {
      thumbnail = item.image_versions2.candidates[0].url;
      if (!videoUrl) {
        videoUrl = thumbnail;
      }
    }

    if (item.carousel_media) {
      type = "carousel";
      // Get first media from carousel
      const firstMedia = item.carousel_media[0];
      if (firstMedia.video_versions?.length > 0) {
        videoUrl = firstMedia.video_versions[0].url;
      } else if (firstMedia.image_versions2?.candidates?.length > 0) {
        videoUrl = firstMedia.image_versions2.candidates[0].url;
        thumbnail = videoUrl;
      }
    }

    const caption = item.caption?.text || "Instagram Post";

    return {
      title: caption.substring(0, 100),
      video_url: videoUrl,
      thumbnail: thumbnail || videoUrl,
      author: item.user?.username,
      type,
      duration: item.video_duration,
    };
  } catch (error) {
    console.log("GraphQL method failed:", error);
    return null;
  }
};

// Method 3: Parse Instagram page HTML for embedded data
const tryPageParsing = async (url: string): Promise<InstagramMedia | null> => {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.log(`Page fetch failed with status: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Try to find video URL in various places
    let videoUrl = "";
    let thumbnail = "";
    let title = "Instagram Post";

    // Pattern 1: Look for video_url in JSON
    const videoUrlMatch = html.match(/"video_url":"([^"]+)"/);
    if (videoUrlMatch) {
      videoUrl = videoUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
    }

    // Pattern 2: Look for contentUrl in JSON-LD
    const contentUrlMatch = html.match(/"contentUrl":"([^"]+)"/);
    if (!videoUrl && contentUrlMatch) {
      videoUrl = contentUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
    }

    // Pattern 3: Look for og:video meta tag
    const ogVideoMatch = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/);
    if (!videoUrl && ogVideoMatch) {
      videoUrl = ogVideoMatch[1];
    }

    // Pattern 4: Look for display_url (for images)
    const displayUrlMatch = html.match(/"display_url":"([^"]+)"/);
    if (displayUrlMatch) {
      thumbnail = displayUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
      if (!videoUrl) {
        videoUrl = thumbnail;
      }
    }

    // Pattern 5: Look for og:image meta tag
    const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    if (!thumbnail && ogImageMatch) {
      thumbnail = ogImageMatch[1];
    }

    // Pattern 6: Look for title
    const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1];
    }

    if (!videoUrl && !thumbnail) {
      console.log("No media URLs found in page");
      return null;
    }

    return {
      title,
      video_url: videoUrl || thumbnail,
      thumbnail: thumbnail || videoUrl,
      type: videoUrl && videoUrl !== thumbnail ? "video" : "image",
    };
  } catch (error) {
    console.log("Page parsing method failed:", error);
    return null;
  }
};

// Method 4: Use Instagram's embed page (most reliable for public content)
const tryEmbedPage = async (shortcode: string): Promise<InstagramMedia | null> => {
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;

    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      console.log(`Embed page failed with status: ${response.status}`);
      return null;
    }

    const html = await response.text();

    let videoUrl = "";
    let thumbnail = "";

    // Look for video source in embed
    const videoSrcMatch = html.match(/video[^>]+src="([^"]+)"/);
    if (videoSrcMatch) {
      videoUrl = videoSrcMatch[1].replace(/&amp;/g, "&");
    }

    // Look for video URL in data attributes or scripts
    const videoDataMatch = html.match(/"video_url":"([^"]+)"/);
    if (!videoUrl && videoDataMatch) {
      videoUrl = videoDataMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
    }

    // Look for image
    const imgMatch = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/);
    if (imgMatch) {
      thumbnail = imgMatch[1].replace(/&amp;/g, "&");
    }

    // Alternative image pattern
    const imgAltMatch = html.match(/<img[^>]+class="[^"]*Image[^"]*"[^>]+src="([^"]+)"/);
    if (!thumbnail && imgAltMatch) {
      thumbnail = imgAltMatch[1].replace(/&amp;/g, "&");
    }

    if (!videoUrl && !thumbnail) {
      return null;
    }

    return {
      title: "Instagram Post",
      video_url: videoUrl || thumbnail,
      thumbnail: thumbnail || videoUrl,
      type: videoUrl ? "video" : "image",
    };
  } catch (error) {
    console.log("Embed page method failed:", error);
    return null;
  }
};

/**
 * Main extraction function - tries multiple methods
 */
export const extractInstagramMedia = async (url: string): Promise<InstagramMedia> => {
  const shortcode = extractShortcode(url);

  if (!shortcode) {
    throw new Error("Invalid Instagram URL - could not extract shortcode");
  }

  console.log(`🔍 Extracting Instagram media for shortcode: ${shortcode}`);

  // Try methods in order of reliability
  const methods = [
    { name: "GraphQL API", fn: () => tryGraphQL(shortcode) },
    { name: "Embed Page", fn: () => tryEmbedPage(shortcode) },
    { name: "Page Parsing", fn: () => tryPageParsing(url) },
  ];

  // Get oEmbed data first for metadata
  const oembedData = await tryOEmbed(url);

  for (const method of methods) {
    console.log(`  Trying ${method.name}...`);
    const result = await method.fn();

    if (result && result.video_url) {
      console.log(`  ✅ ${method.name} succeeded`);

      // Merge with oEmbed data if available
      return {
        ...result,
        title: result.title || oembedData?.title || "Instagram Post",
        author: result.author || oembedData?.author,
        thumbnail: result.thumbnail || oembedData?.thumbnail || result.video_url,
      };
    }
    console.log(`  ❌ ${method.name} failed`);
  }

  // If all methods fail but we have oEmbed data, return that with thumbnail as video_url
  if (oembedData?.thumbnail) {
    console.log("  ⚠️ Using oEmbed thumbnail as fallback");
    return {
      title: oembedData.title || "Instagram Post",
      video_url: oembedData.thumbnail,
      thumbnail: oembedData.thumbnail,
      author: oembedData.author,
      type: "image",
    };
  }

  throw new Error("Failed to extract Instagram media - all methods failed");
};

// ============================================================
// PROFILE SCRAPING FUNCTIONS
// ============================================================

export interface ProfilePost {
  shortcode: string;
  url: string;
  is_video: boolean;
  thumbnail: string;
  caption?: string;
}

export interface ProfileInfo {
  username: string;
  full_name?: string;
  biography?: string;
  profile_pic?: string;
  post_count?: number;
  follower_count?: number;
  following_count?: number;
  posts: ProfilePost[];
}

// Extract username from Instagram profile URL
const extractUsername = (url: string): string | null => {
  // Handle various profile URL formats
  const patterns = [
    /instagram\.com\/([A-Za-z0-9._]+)\/?(?:\?|$)/,
    /instagram\.com\/([A-Za-z0-9._]+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && !["p", "reel", "reels", "tv", "stories", "explore"].includes(match[1])) {
      return match[1];
    }
  }

  return null;
};

// Check if URL is a profile URL
export const isProfileUrl = (url: string): boolean => {
  const username = extractUsername(url);
  return username !== null;
};

// Check if URL is a post/reel URL
export const isPostUrl = (url: string): boolean => {
  return extractShortcode(url) !== null;
};

// Fetch profile posts using multiple methods
const fetchProfilePosts = async (username: string): Promise<ProfileInfo> => {
  console.log(`📱 Fetching profile posts for: ${username}`);
  const errors: string[] = [];
  const hasSession = getInstagramSession() !== null;
  console.log(`  Session available: ${hasSession}`);

  // Method 1: Try Instagram's web API with authenticated headers
  try {
    console.log("  Trying web API...");
    const authHeaders = buildAuthHeaders();
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      headers: authHeaders,
    });

    if (response.ok) {
      const data = await response.json();
      const user = data.data?.user;

      if (user) {
        const posts: ProfilePost[] = [];
        const edges = user.edge_owner_to_timeline_media?.edges || [];

        for (const edge of edges) {
          const node = edge.node;
          posts.push({
            shortcode: node.shortcode,
            url: `https://www.instagram.com/p/${node.shortcode}/`,
            is_video: node.is_video || false,
            thumbnail: node.thumbnail_src || node.display_url,
            caption: node.edge_media_to_caption?.edges?.[0]?.node?.text,
          });
        }

        console.log(`  ✅ Found ${posts.length} posts via web API`);

        return {
          username: user.username,
          full_name: user.full_name,
          biography: user.biography,
          profile_pic: user.profile_pic_url_hd || user.profile_pic_url,
          post_count: user.edge_owner_to_timeline_media?.count,
          follower_count: user.edge_followed_by?.count,
          following_count: user.edge_follow?.count,
          posts,
        };
      }
    } else {
      errors.push(`Web API returned ${response.status}`);
    }
  } catch (error) {
    errors.push(`Web API: ${error}`);
    console.log("  Web API method failed:", error);
  }

  // Method 2: Try the GraphQL endpoint
  try {
    console.log("  Trying GraphQL API...");
    const authHeaders = buildAuthHeaders();
    // First get user ID from username
    const userResponse = await fetch(`https://www.instagram.com/${username}/?__a=1&__d=dis`, {
      headers: {
        ...authHeaders,
        "Accept": "application/json",
      },
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      const user = userData.graphql?.user || userData.user;

      if (user) {
        const posts: ProfilePost[] = [];
        const edges = user.edge_owner_to_timeline_media?.edges || [];

        for (const edge of edges) {
          const node = edge.node;
          posts.push({
            shortcode: node.shortcode,
            url: `https://www.instagram.com/p/${node.shortcode}/`,
            is_video: node.is_video || false,
            thumbnail: node.thumbnail_src || node.display_url,
            caption: node.edge_media_to_caption?.edges?.[0]?.node?.text,
          });
        }

        console.log(`  ✅ Found ${posts.length} posts via GraphQL`);

        return {
          username: user.username,
          full_name: user.full_name,
          biography: user.biography,
          profile_pic: user.profile_pic_url_hd || user.profile_pic_url,
          post_count: user.edge_owner_to_timeline_media?.count,
          follower_count: user.edge_followed_by?.count,
          following_count: user.edge_follow?.count,
          posts,
        };
      }
    } else {
      errors.push(`GraphQL returned ${userResponse.status}`);
    }
  } catch (error) {
    errors.push(`GraphQL: ${error}`);
    console.log("  GraphQL method failed:", error);
  }

  // Method 3: Try scraping the profile page HTML
  try {
    console.log("  Trying page scraping...");
    const authHeaders = buildAuthHeaders();
    const response = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        ...authHeaders,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
      },
    });

    if (!response.ok) {
      errors.push(`Page scrape returned ${response.status}`);
      throw new Error(`Profile page fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const posts: ProfilePost[] = [];
    const seenShortcodes = new Set<string>();

    // Try to find embedded JSON data first
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});<\/script>/);
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1]);
        const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
        if (user) {
          const edges = user.edge_owner_to_timeline_media?.edges || [];
          for (const edge of edges) {
            const node = edge.node;
            posts.push({
              shortcode: node.shortcode,
              url: `https://www.instagram.com/p/${node.shortcode}/`,
              is_video: node.is_video || false,
              thumbnail: node.thumbnail_src || node.display_url,
              caption: node.edge_media_to_caption?.edges?.[0]?.node?.text,
            });
            seenShortcodes.add(node.shortcode);
          }
          console.log(`  ✅ Found ${posts.length} posts via embedded JSON`);
          return {
            username: user.username || username,
            full_name: user.full_name,
            biography: user.biography,
            profile_pic: user.profile_pic_url_hd || user.profile_pic_url,
            post_count: user.edge_owner_to_timeline_media?.count,
            posts,
          };
        }
      } catch (e) {
        console.log("  Could not parse embedded JSON");
      }
    }

    // Try to find additional data in other script tags
    const additionalDataMatch = html.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{.+?\})\s*\)/);
    if (additionalDataMatch) {
      try {
        const additionalData = JSON.parse(additionalDataMatch[1]);
        const user = additionalData?.graphql?.user || additionalData?.user;
        if (user) {
          const edges = user.edge_owner_to_timeline_media?.edges || [];
          for (const edge of edges) {
            const node = edge.node;
            if (!seenShortcodes.has(node.shortcode)) {
              posts.push({
                shortcode: node.shortcode,
                url: `https://www.instagram.com/p/${node.shortcode}/`,
                is_video: node.is_video || false,
                thumbnail: node.thumbnail_src || node.display_url,
              });
              seenShortcodes.add(node.shortcode);
            }
          }
        }
      } catch (e) {
        console.log("  Could not parse additional data");
      }
    }

    // Fallback: Extract shortcodes from the page using regex
    const shortcodeMatches = html.matchAll(/\/p\/([A-Za-z0-9_-]+)\//g);
    for (const match of shortcodeMatches) {
      const shortcode = match[1];
      if (!seenShortcodes.has(shortcode)) {
        seenShortcodes.add(shortcode);
        posts.push({
          shortcode,
          url: `https://www.instagram.com/p/${shortcode}/`,
          is_video: false,
          thumbnail: "",
        });
      }
    }

    // Also look for reels
    const reelMatches = html.matchAll(/\/reel\/([A-Za-z0-9_-]+)\//g);
    for (const match of reelMatches) {
      const shortcode = match[1];
      if (!seenShortcodes.has(shortcode)) {
        seenShortcodes.add(shortcode);
        posts.push({
          shortcode,
          url: `https://www.instagram.com/reel/${shortcode}/`,
          is_video: true,
          thumbnail: "",
        });
      }
    }

    if (posts.length > 0) {
      console.log(`  ✅ Found ${posts.length} posts via page scraping`);
      return {
        username,
        posts,
      };
    }
  } catch (error) {
    errors.push(`Page scrape: ${error}`);
    console.log("  Page scraping method failed:", error);
  }

  // All methods failed
  const errorDetails = errors.join("; ");
  console.log(`  ❌ All profile extraction methods failed: ${errorDetails}`);
  const sessionHint = hasSession
    ? "Session cookies may be expired or invalid. Please update INSTAGRAM_SESSION_ID and INSTAGRAM_CSRF_TOKEN."
    : "Configure INSTAGRAM_SESSION_ID, INSTAGRAM_CSRF_TOKEN, and INSTAGRAM_DS_USER_ID in .env for authenticated access.";
  throw new Error(`Failed to fetch profile for @${username}. ${sessionHint}`);
};

/**
 * Extract all media from an Instagram profile
 * Method priority:
 * 1. RapidAPI (if configured) - returns video URLs directly
 * 2. Puppeteer browser automation - headless browser scraping
 * 3. Instagram session cookies + API
 * 4. Page scraping fallback
 */
export const extractProfileMedia = async (
  profileUrl: string,
  options: { videosOnly?: boolean; limit?: number } = {}
): Promise<{ profile: ProfileInfo; media: InstagramMedia[] }> => {
  const username = extractUsername(profileUrl);

  if (!username) {
    throw new Error("Invalid Instagram profile URL");
  }

  const { videosOnly = false, limit = 50 } = options;
  const reelsLimit = Math.min(limit, 50);

  console.log(`📱 Extracting profile media for @${username} (limit: ${reelsLimit}, videosOnly: ${videosOnly})`);

  // Method 1: Try RapidAPI first (most reliable, gives video URLs directly)
  const rapidAPIResult = await fetchProfileAndReelsViaRapidAPI(username, reelsLimit);
  if (rapidAPIResult && rapidAPIResult.reels.length > 0) {
    console.log(`✅ RapidAPI extracted ${rapidAPIResult.reels.length} reels from @${username}`);

    const media: InstagramMedia[] = rapidAPIResult.reels
      .filter((r) => r.video_url) // Only include reels with video URLs
      .map((reel) => ({
        title: reel.caption?.substring(0, 100) || "Instagram Reel",
        video_url: reel.video_url,
        thumbnail: reel.thumbnail,
        duration: reel.duration,
        author: username,
        type: "video" as const,
      }));

    const profileInfo: ProfileInfo = {
      ...rapidAPIResult.profile,
      posts: rapidAPIResult.reels.map((r) => ({
        shortcode: r.shortcode,
        url: r.url,
        is_video: true,
        thumbnail: r.thumbnail,
        caption: r.caption,
      })),
    };

    return { profile: profileInfo, media };
  }

  // Method 2: Try Puppeteer browser automation
  console.log("  RapidAPI unavailable or failed, trying Puppeteer...");
  const puppeteerResult = await fetchProfileViaPuppeteer(username, reelsLimit);
  if (puppeteerResult && puppeteerResult.reels.length > 0) {
    console.log(`✅ Puppeteer extracted ${puppeteerResult.reels.length} reels from @${username}`);

    const media: InstagramMedia[] = puppeteerResult.reels
      .filter((r) => r.video_url)
      .map((reel) => ({
        title: reel.caption?.substring(0, 100) || "Instagram Reel",
        video_url: reel.video_url,
        thumbnail: reel.thumbnail,
        author: username,
        type: "video" as const,
      }));

    const profileInfo: ProfileInfo = {
      ...puppeteerResult.profile,
      posts: puppeteerResult.reels.map((r) => ({
        shortcode: r.shortcode,
        url: r.url,
        is_video: true,
        thumbnail: r.thumbnail,
        caption: r.caption,
      })),
    };

    return { profile: profileInfo, media };
  }

  // Method 3: Fall back to existing methods (session cookies + scraping)
  console.log("  Puppeteer failed, trying legacy fallback methods...");

  const profileInfo = await fetchProfilePosts(username);
  const media: InstagramMedia[] = [];
  const errors: string[] = [];

  // Filter posts if videosOnly
  let postsToProcess = profileInfo.posts;
  if (videosOnly) {
    postsToProcess = postsToProcess.filter((p) => p.is_video);
  }

  // Apply limit
  postsToProcess = postsToProcess.slice(0, limit);

  console.log(`📥 Extracting ${postsToProcess.length} posts from @${username}...`);

  // Process posts with concurrency limit
  const CONCURRENCY = 3;
  for (let i = 0; i < postsToProcess.length; i += CONCURRENCY) {
    const batch = postsToProcess.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((post) => extractInstagramMedia(post.url))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const post = batch[j];

      if (result.status === "fulfilled") {
        media.push({
          ...result.value,
          author: username,
        });
      } else {
        errors.push(`Failed to extract ${post.url}: ${result.reason}`);
        console.log(`  ❌ Failed: ${post.shortcode}`);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + CONCURRENCY < postsToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`✅ Extracted ${media.length}/${postsToProcess.length} posts from @${username}`);

  if (errors.length > 0) {
    console.log(`⚠️ ${errors.length} posts failed to extract`);
  }

  return { profile: profileInfo, media };
};

// ============================================================
// BULK EXTRACTION FUNCTIONS
// ============================================================

export interface BulkExtractionResult {
  url: string;
  success: boolean;
  media?: InstagramMedia;
  error?: string;
}

export interface ProfileExtractionResult {
  url: string;
  username: string;
  success: boolean;
  profile?: ProfileInfo;
  media?: InstagramMedia[];
  error?: string;
}

/**
 * Extract media from multiple Instagram URLs (posts/reels)
 */
export const extractMultipleMedia = async (
  urls: string[],
  options: { concurrency?: number } = {}
): Promise<BulkExtractionResult[]> => {
  const { concurrency = 3 } = options;
  const results: BulkExtractionResult[] = [];

  console.log(`📦 Bulk extracting ${urls.length} URLs...`);

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((url) => extractInstagramMedia(url))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const url = batch[j];

      if (result.status === "fulfilled") {
        results.push({
          url,
          success: true,
          media: result.value,
        });
      } else {
        results.push({
          url,
          success: false,
          error: result.reason?.message || "Extraction failed",
        });
      }
    }

    // Small delay between batches
    if (i + concurrency < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`✅ Bulk extraction complete: ${successCount}/${urls.length} succeeded`);

  return results;
};

/**
 * Extract all media from multiple Instagram profiles
 */
export const extractMultipleProfiles = async (
  profileUrls: string[],
  options: { videosOnly?: boolean; limitPerProfile?: number; concurrency?: number } = {}
): Promise<ProfileExtractionResult[]> => {
  const { videosOnly = false, limitPerProfile = 50, concurrency = 2 } = options;
  const results: ProfileExtractionResult[] = [];

  console.log(`📦 Extracting from ${profileUrls.length} profiles...`);

  for (let i = 0; i < profileUrls.length; i += concurrency) {
    const batch = profileUrls.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((url) =>
        extractProfileMedia(url, { videosOnly, limit: limitPerProfile })
      )
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const url = batch[j];
      const username = extractUsername(url) || "unknown";

      if (result.status === "fulfilled") {
        results.push({
          url,
          username,
          success: true,
          profile: result.value.profile,
          media: result.value.media,
        });
      } else {
        results.push({
          url,
          username,
          success: false,
          error: result.reason?.message || "Profile extraction failed",
        });
      }
    }

    // Delay between profile batches (profiles are heavier)
    if (i + concurrency < profileUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`✅ Profile extraction complete: ${successCount}/${profileUrls.length} succeeded`);

  return results;
};

export default extractInstagramMedia;
