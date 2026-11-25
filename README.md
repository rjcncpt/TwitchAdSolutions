# TwitchAdSolutions

**Watch Twitch streams without sitting through ad breaks.**
Free, for desktop browsers.

When Twitch starts an ad break, the script quietly switches your player to an ad-free copy of
the same stream, then switches back when the break ends. If Twitch has no ad-free copy to give,
the script cuts the ad out instead. It runs in your browser, with no account and no proxy.

```
Twitch stream  ──►  ad break?  ──►  ad-free copy of the stream  ──►  your player
                        └──►  no copy available  ──►  ad cut out
```

## Install

**[Install VAFT](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/vaft/vaft.user.js)**
in a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/) or
[Tampermonkey](https://www.tampermonkey.net/), then reload Twitch. Your manager keeps it up to date.

Use one Twitch ad blocker at a time. Two scripts fighting over the same player cause freezes and
black screens.

## Features

### Ad breaks swapped out

While an ad plays for everyone else, you keep watching the stream. The script asks Twitch for
the copy it sends to embedded and pop-out players, which usually has no ads, and plays that
instead.

- **Same quality where possible.** The embedded and pop-out copies come at full quality. If only
  the autoplay copy is clean, you'll watch at 360p until the break ends.
- **No clean copy?** The ad is removed, so the stream may pause for a moment rather than show it.
- **When the break ends,** the player reloads for a moment and returns to your usual quality and
  volume.

### Unsticks a frozen player

If the stream stops moving while it still has video to play, the script pauses and resumes it
for you.

### Replaces the original script

This is the maintained version of [pixeltris's TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions),
which closed in March 2026. If you have the original installed, open the install link above and
your manager will offer to replace it.

## Get started

1. **Install a userscript manager.** [Violentmonkey](https://violentmonkey.github.io/) or
   [Tampermonkey](https://www.tampermonkey.net/) both work.
2. **Install the script.** Open the
   [VAFT link](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/vaft/vaft.user.js)
   and press **Install**.
3. **Turn off other Twitch ad blockers,** including any older copy of this script.
4. **Reload Twitch** and start watching.

### Using uBlock Origin instead

1. Open the uBlock Origin dashboard. In **My filters**, add `twitch.tv##+js(twitch-videoad)` and
   press **Apply changes**.
2. In **Settings**, tick **I am an advanced user**, then click the gear beside it. Add the
   [VAFT resource URL](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/vaft/vaft-ublock-origin.js)
   to `userResourcesLocation`, separated by a space from any URL already there.
3. Restart the browser and reload Twitch.

To remove it, delete the filter and the URL you added. Leave any other URLs in place, or write
`unset` if none are left.

## Which script?

| Script | When to use it | Install |
| --- | --- | --- |
| **VAFT** | Recommended for everyone. | [Userscript](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/vaft/vaft.user.js) · [uBlock Origin](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/vaft/vaft-ublock-origin.js) |
| video-swap-new | Try it only if VAFT doesn't work well for you. | [Userscript](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/video-swap-new/video-swap-new.user.js) · [uBlock Origin](https://raw.githubusercontent.com/rjcncpt/TwitchAdSolutions/master/video-swap-new/video-swap-new-ublock-origin.js) |

Install one, not both.

## What you need

- Twitch in a desktop browser. The mobile site isn't supported.
- Violentmonkey, Tampermonkey or uBlock Origin. Greasemonkey isn't supported.

## Something not working?

See the [troubleshooting guide](issues.md) for fixes to common problems, such as black screens,
buffering during ads, or the script not loading.

## Other options

These are separate projects by other people.

- [TTV LOL PRO](https://github.com/younesaassila/ttv-lol-pro): [Chrome](https://chromewebstore.google.com/detail/ttv-lol-pro/bpaoeijjlplfjbagceilcgbkcdjbomjd), [Firefox](https://addons.mozilla.org/addon/ttv-lol-pro/). Routes video through proxies, which can buffer or go down.
- [Purple AdBlock](https://github.com/arthurbolsoni/Purple-adblock/): [Chrome](https://chromewebstore.google.com/detail/purple-ads-blocker/lkgcfobnmghhbhgekffaadadhmeoindg), [Firefox](https://addons.mozilla.org/en-US/firefox/addon/purpleadblock/), [userscript](https://raw.githubusercontent.com/arthurbolsoni/Purple-adblock/refs/heads/main/platform/tampermonkey/dist/purpleadblocker.user.js).
- [AdGuard Extra](https://github.com/AdguardTeam/AdGuardExtra/): [Chrome](https://chromewebstore.google.com/detail/adguard-extra-beta/mglpocjcjbekdckiahfhagndealpkpbj), [Firefox](https://github.com/AdguardTeam/AdGuardExtra/#firefox), [userscript](https://userscripts.adtidy.org/release/adguard-extra/1.0/adguard-extra.user.js).
- Alternate Player for Twitch.tv: [Firefox](https://addons.mozilla.org/en-US/firefox/addon/twitch_5/).
- [TTV Ad Mute](https://github.com/drj101687/ttv-ad-mute): [Firefox](https://addons.mozilla.org/en-US/firefox/addon/twitch-tv-ad-mute/). Mutes ads instead of removing them.
- [Twitch Turbo](https://www.twitch.tv/turbo): Twitch's own paid, ad-free subscription.

More in the [full list](full-list.md).

## Credits and licence

Built on the work of [pixeltris and the TwitchAdSolutions contributors](https://github.com/pixeltris/TwitchAdSolutions),
[VideoAdBlockForTwitch](https://github.com/muleyo/VideoAdBlockForTwitch#credits) and
saucettv. See the [licence](LICENSE).
