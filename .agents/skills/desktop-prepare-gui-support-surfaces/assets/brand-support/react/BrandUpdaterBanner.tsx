import { Image } from "@mantine/core";
import type { ReactElement } from "react";

import {
  BRAND_SUPPORT_PROFILE,
  resolveBrandAssetPath,
} from "./brandSupportProfile";

/** 品牌更新横幅模板的本地路径与替代文本。 */
export interface BrandUpdaterBannerProps {
  alt: string;
  assetBasePath?: string;
}

/** 仅渲染本地品牌横幅，不启用更新检查、下载或远程 endpoint。 */
export function BrandUpdaterBanner({
  alt,
  assetBasePath = BRAND_SUPPORT_PROFILE.publicBasePath,
}: BrandUpdaterBannerProps): ReactElement {
  if (alt.trim() === "") {
    throw new Error("brand updater banner requires localized alt text");
  }
  return (
    <Image
      alt={alt}
      fit="cover"
      radius="md"
      src={resolveBrandAssetPath(
        assetBasePath,
        BRAND_SUPPORT_PROFILE.updater.banner,
      )}
    />
  );
}
