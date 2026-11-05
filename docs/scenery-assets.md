# 한강 배경 자산

2026-11-05, built-in `imagegen`으로 만든 실사풍 생성 이미지. 실제 촬영 사진은 아니다.

저장 위치: `web/public/scenery/`.

- `hangang-day.webp`: 낮의 도시·산·잔디 재질 원본.
- `hangang-sunset.webp`: 같은 구도의 노을 조명.
- `hangang-night.webp`: 같은 구도의 야간 조명.
- `hangang-land.webp`: 하늘과 물을 투명하게 제거한 지형 마스크.
- `woven-mat.webp`: 투명 배경의 짚 멍석.

렌더러는 지형 마스크를 낮·노을·밤 원본에 적용해 **도시·남산·잔디만** 합성한다. 원본 사진의 하늘과 강물은 화면에 사용하지 않는다. 하늘·구름·해·달·별은 실시간으로 그린다. 수면은 독립적인 파동장으로 계산하고, 현재 하늘과 도시를 반사한다. 비·눈·안개·번개와 수면 거칠기는 날씨에 연동된다. 생성 이미지에는 사람이 포함되어 있지 않으며, 기존 좌석과 인물은 별도의 레이어다.

## 생성 프롬프트

### 낮 풍경 — 신규 생성

Use case: photorealistic-natural. Create a very high resolution, widescreen 16:10 photographic background plate for a peaceful Han River website. Realistic location: seated eye-level on the grassy southern bank at Yeouido Hangang Park, Seoul, looking north/northeast across the broad Han River toward the north bank, with recognizable N Seoul Tower on the wooded Namsan hill on the RIGHT at about 73% across the frame. This must look like an exceptionally beautiful real full-frame camera landscape photograph, NOT illustration, NOT CGI, NOT game art. Natural late-afternoon daylight, blue sky with delicate natural high clouds, soft slightly warm atmosphere, accurate atmospheric haze and believable Seoul residential skyline at a real distant scale. Panoramic composition: generous quiet sky is top 48%; distant north-bank shoreline/waterline is precisely at 56% of image height, small distant buildings and Namsan extend upward; wide gently rippling Han River fills y=56% through y=80%; a very narrow unobtrusive low concrete water edge at y=80%; richly detailed real mown park grass fills bottom 20%, softly sunlit with individual grass blades and subtle unevenness. The bottom foreground must be empty grass so seated people and picnic mats can be composited by the app. The skyline should have realistic Seoul apartments, Yongsan urban clusters, convincing naturally forested asymmetrical Namsan and a slender recognizable N Seoul Tower, with no tower on left. Keep all major architecture below the upper 32% so UI text fits in sky. Camera is level, no tilt, no fish-eye. Natural lifelike textured water, complex small silver reflections, subtle color variation. Restrained photographic grading, detailed but no HDR oversharpening. Every material real: trees, concrete, river ripples, grass. No people, no mats, no picnic objects, no railings obscuring the view, no text, no logos, no watermark. Single coherent landscape photograph edge to edge.

### 노을 — 낮 풍경의 조명 편집

Use case: lighting-weather. Edit this exact landscape photograph into a beautiful realistic late sunset / blue-hour transition. KEEP the camera, framing, crop, shoreline positions, every building, mountain, tower and foreground pixel geometry exactly unchanged. Only change lighting and time of day. Sunset glow comes from the LEFT/west outside frame: warm apricot and soft rose horizon, subdued blue and mauve high sky, delicate cloud edges illuminated peach, forest becomes softly muted olive, a few warm windows and riverside lights beginning to turn on. The actual textured river reflects a subtle pink-copper sunset with finely detailed natural water ripples. Grass softly amber green, still textured. This must remain an understated real photograph, not an illustration or oversaturated fantasy. Do not add a large sun, people, objects, text, railings or mats. Single edge-to-edge photo. Preserve aspect ratio and EXACT spatial layout of input.

### 밤 — 낮 풍경의 조명 편집

Use case: lighting-weather. Edit this exact landscape photograph into a highly realistic peaceful Seoul night photograph. KEEP camera, framing, crop, every building and hill, shoreline coordinates, tower and foreground geometry exactly unchanged; change only lighting/time of day. Deep midnight blue sky with faint natural cloud shapes, believable atmospheric city glow near horizon, no giant moon and only very sparse stars. N Seoul Tower has tasteful pale blue-white lighting, scattered warmly illuminated apartment windows and natural riverside lamps across north bank. Their light reflections on the real water are detailed gently fragmented amber, pale white and faint blue streaks, realistic exposure, not neon. Grass foreground is dark but discernible, softly lit by unseen warm park lamps behind camera. Retain fine real photographic material texture throughout. Do not add people, mats, railing, text, logos or any new architecture. Match exact image extent and aspect ratio.

### 멍석 — 투명 배경 신규 생성

Use case: product-mockup. Asset type: a photorealistic transparent-background sprite of ONE Korean traditional straw picnic mat, a rectangular woven mungseok mat. Real straw fibers, natural muted golden tan, tightly woven interlacing reeds, slightly irregular braided edge binding, tactile thickness, a few delicate frayed fibers. View from low seated eye level behind the mat, looking slightly down toward its far edge; the mat lies flat on a horizontal ground plane and appears as a broad low trapezoid, the far edge shorter than the near edge. Front edge horizontal, no tilt left or right, no rolled up edge. The mat occupies a wide 4:1 horizontal silhouette, centered with minimal clear margin; empty entire surface with no person or object on it. Soft diffuse light from upper left, realistic gentle contact shadow beneath mat. Isolated on genuinely transparent background, no scene, no floor, no green grass, no checkerboard, no text, no logos. Product photograph quality, NOT illustration or 3D render.

### 지형 마스크 — 낮 풍경에서 하늘과 물 제거

Use case: background-extraction. This landscape will be layered over a REALTIME simulated sky and river. Preserve the image at its EXACT original composition, aspect ratio 1586:992, same full-frame extent and identical pixel positions. Remove ALL SKY and ALL RIVER WATER to genuine alpha transparency. Retain ONLY the distant Seoul skyline with its fine building silhouettes, Namsan hill, N Seoul Tower and trees down to the far shoreline at y about 57.5%, PLUS the separate foreground grass and thin stone edge from y about 80.5% to the bottom. All remaining city/forest/grass must keep its original photoreal material detail, shape, scale and lighting. The whole upper sky area and whole river area between the two land areas MUST be fully transparent, not black, white, checkerboard or filled. Do NOT redraw or reposition any landmark. Do NOT crop out the transparent margins or resize the content. Preserve the slender N Seoul Tower antenna as an opaque detail. This is one full-frame transparent PNG compositing plate with two disconnected land regions.
