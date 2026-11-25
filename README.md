# TwitchAdSolutions

Userscripts that block video ads on Twitch in desktop browsers. They run locally in your browser, need no account and use no proxy.

This repository is a fork of [pixeltris's TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions). The recommended script is VAFT.

## Install

1. Install a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [VAFT install link](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/vaft/vaft.user.js) and confirm the installation.
3. Reload Twitch.

Run only one Twitch ad blocker at a time. Two scripts working on the same player can cause freezes and black screens, so disable any other Twitch ad blocker, including older copies of this script.

### uBlock Origin

If you use uBlock Origin instead of a userscript manager:

1. In the uBlock Origin dashboard, add `twitch.tv##+js(twitch-videoad)` under **My filters** and apply the changes.
2. Under **Settings**, enable **I am an advanced user**, click the gear icon next to it and add the [VAFT resource URL](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/vaft/vaft-ublock-origin.js) to `userResourcesLocation`. Separate it with a space from any URL that is already there.
3. Restart the browser and reload Twitch.

To remove it, delete the filter and the URL you added. Leave other URLs in place, or write `unset` if none are left.

## How VAFT works

When an ad break starts, VAFT requests the same stream through other player types and plays that copy instead. It tries `embed` and `popout` first. If both still contain ads, it falls back to `autoplay`, which only offers 360p, so the picture is blurry until the break ends.

If no clean copy is available, VAFT removes the ad segments from the playlist instead. The stream may then pause briefly.

When the break is over, the player reloads so that it returns to your usual quality and volume. VAFT also pauses and resumes the player when the stream stalls while video is still buffered.

## Which script?

| Script | When to use it | Install |
| --- | --- | --- |
| VAFT | Recommended for most people. | [Userscript](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/vaft/vaft.user.js), [uBlock Origin](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/vaft/vaft-ublock-origin.js) |
| video-swap-new | Only if VAFT does not work well for you. | [Userscript](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/video-swap-new/video-swap-new.user.js), [uBlock Origin](https://github.com/rjcncpt/TwitchAdSolutions/raw/refs/heads/master/video-swap-new/video-swap-new-ublock-origin.js) |

Install one script, not both.

## Requirements

- Twitch in a desktop browser. The mobile site is not supported.
- Violentmonkey, Tampermonkey or uBlock Origin.

## Problems

[issues.md](issues.md) covers common problems such as black screens, buffering during ads and the script not loading.

Other ad-blocking tools are listed in [full-list.md](full-list.md).

## Credits and license

Based on the work of [pixeltris and the TwitchAdSolutions contributors](https://github.com/pixeltris/TwitchAdSolutions), [VideoAdBlockForTwitch](https://github.com/cleanlock/VideoAdBlockForTwitch#credits) and [saucettv](https://github.com/saucettv/VideoAdBlockForTwitch).

Released under the MIT license, see [LICENSE](LICENSE).
