const assert = require('node:assert/strict');
const { loadScript, loadWorker, outcome } = require('./browser.cjs');

const host = 'https://cdn.invalid';
const masterUrl = 'https://usher.ttvnw.net/api/channel/hls/test.m3u8?ticket=fixture';
const mediaUrl = host + '/quality.m3u8';
const gqlUrl = 'https://gql.twitch.tv/gql';
const plainMedia = '#EXTM3U\n#EXTINF:1,live\n' + host + '/live.ts\n';
const adMedia = '#EXTM3U\n#EXT-X-DATERANGE:ID="stitched-ad",X-TV-TWITCH-AD-URL="https://tracking.invalid/ad",X-TV-TWITCH-AD-CLICK-TRACKING-URL="https://tracking.invalid/click"\n#EXTINF:1,live\n' + host + '/live.ts\n';

function json(value) { return JSON.stringify(value); }

function masterPlaylist(uri, { codecs = true } = {}) {
    return '#EXTM3U\n#EXT-X-SESSION-DATA:DATA-ID="FIXTURE",VALUE="ok"\n'
        + '#EXT-X-TWITCH-INFO:SERVER-TIME="20.0"\n'
        + '#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=640x360'
        + (codecs ? ',CODECS="avc1.42e01e"' : '')
        + '\n' + uri + '\n';
}

function fixture(context, url, body, init = {}) {
    context.run(`route(${json(url)}, ${json(body)}, ${json(init)})`);
}

async function playback(source, path) {
    const page = loadScript(source, path);
    const worker = loadWorker(page);
    fixture(worker, masterUrl, masterPlaylist(mediaUrl));
    fixture(worker, mediaUrl, plainMedia);
    const result = await outcome(worker.run(`fetch(${json(masterUrl)})`));
    assert.equal(result.state, 'fulfilled', 'healthy master playlist settles');
    assert.equal(result.value.status, 200);
    assert.match(await result.value.text(), /#EXT-X-STREAM-INF/);
    return { page, worker };
}

const cases = [
    {
        name: 'guards versions, headers, worker requests and backup retries',
        only: 'vaft',
        async run(source, path) {
            const newer = loadScript('', 'empty.js');
            newer.run('window.twitchAdSolutionsVersion = 1000;');
            newer.run(source, path);
            assert.equal(newer.run('window.twitchAdSolutionsVersion'), 1000);

            const page = loadScript(source, path);
            const authorization = 'fixture\'quoted\\value';
            fixture(page, gqlUrl, 'ok');
            await page.run(`fetch(${json(gqlUrl)}, {headers: {Authorization: ${json(authorization)}}})`);
            const quoted = loadWorker(page);
            assert.equal(quoted.run('AuthorizationHeader'), authorization);

            page.run(`
                const relay = new Worker('blob:https://www.twitch.tv/relay');
                relay.emit('message', {key: 'FetchRequest', value: {id: '1', url: 'https://other.invalid/x'}});
            `);
            await new Promise(resolve => setImmediate(resolve));
            assert.match(page.run('relay.messages[0].value.error'), /Blocked/);

            const { worker } = await playback(source, path);
            assert.equal(worker.run(`getStreamUrlForResolution(
                '#EXT-X-STREAM-INF:RESOLUTION=640x360\\nhttps://cdn.invalid/first.m3u8',
                {Resolution: '640x360'})`), 'https://cdn.invalid/first.m3u8');
            worker.run(`
                BackupPlayerTypes = ['fixture'];
                PlayerReloadMinimalRequestsTime = 0;
                graphQLResponse = {status: 503, body: '{}'};
            `);
            fixture(worker, mediaUrl, adMedia);
            const tokenRequests = "workerMessages.filter(m => m.key === 'FetchRequest').length";
            await worker.run(`fetch(${json(mediaUrl)})`);
            await worker.run(`fetch(${json(mediaUrl)})`);
            assert.equal(worker.evaluate(tokenRequests), 1, 'a recent failure is not retried');
            worker.run('advance(10000)');
            await worker.run(`fetch(${json(mediaUrl)})`);
            assert.equal(worker.evaluate(tokenRequests), 2, 'the retry happens after the delay');
        },
    },
    {
        name: 'returns or rejects every playlist fetch',
        legacy: true,
        async run(source, path) {
            const { worker } = await playback(source, path);
            fixture(worker, mediaUrl, '', { readError: 'fixture body read failed' });
            const failed = await outcome(worker.run(`fetch(${json(mediaUrl)})`));
            assert.equal(failed.state, 'rejected', 'a body read failure reaches the playback caller');
            assert.match(failed.message, /fixture body read failed/);

            fixture(worker, mediaUrl, plainMedia);
            const recovered = await outcome(worker.run(`fetch(${json(mediaUrl)})`));
            assert.equal(recovered.state, 'fulfilled');
            assert.equal(await recovered.value.text(), plainMedia);
            fixture(worker, `${masterUrl}&new=1`, '', { networkError: 'fixture network failure' });
            const missing = await outcome(worker.run(`fetch(${json(`${masterUrl}&new=1`)})`));
            assert.equal(missing.state, 'rejected', 'a master playlist request also settles after a network failure');
        },
    },
    {
        name: 'returns sanitized ad links in the playlist',
        legacy: true,
        async run(source, path) {
            const { worker } = await playback(source, path);
            worker.run(`
                if (typeof BackupPlayerTypes !== 'undefined') BackupPlayerTypes = [];
                if (typeof OPT_BACKUP_PLAYER_TYPES !== 'undefined') OPT_BACKUP_PLAYER_TYPES = [];
            `);
            fixture(worker, mediaUrl, adMedia);
            const response = await outcome(worker.run(`fetch(${json(mediaUrl)})`));
            assert.equal(response.state, 'fulfilled');
            const body = await response.value.text();
            assert.doesNotMatch(body, /tracking\.invalid/);
            assert.match(body, /X-TV-TWITCH-AD-URL="https:\/\/twitch\.tv"/);
            assert.match(body, /X-TV-TWITCH-AD-CLICK-TRACKING-URL="https:\/\/twitch\.tv"/);
            assert.match(body, /live\.ts/);
        },
    },
    {
        name: 'preserves Fetch request forms and mixed GraphQL operations',
        async run(source, path) {
            const page = loadScript(source, path);
            const unrelated = 'https://other.invalid/log?q=gql';
            fixture(page, unrelated, 'untouched');
            const simple = await page.run(`fetch(${json(unrelated)})`);
            assert.equal(await simple.text(), 'untouched', 'unrelated requests bypass the GraphQL hook');
            fixture(page, gqlUrl, 'ok');
            const playback = {operationName: 'PlaybackAccessToken', variables: {playerType: 'frontpage'}};
            await page.run(`const observedWorker = new Worker('blob:https://www.twitch.tv/fixture');`);
            await page.run(`fetch(${json(gqlUrl)}, {method: 'POST',
                headers: {'X-Device-Id': 'fixture-device', 'Client-Integrity': 'fixture-integrity',
                    'Authorization': 'fixture-authorization', 'Client-Version': 'fixture-version',
                    'Client-Session-Id': 'fixture-session'},
                body: ${json(json(playback))}
            })`);
            const nativeCall = page.evaluate('requests.at(-1)');
            assert.equal(JSON.parse(nativeCall.body).variables.playerType, 'popout');
            assert.equal(nativeCall.headers.authorization, 'fixture-authorization');
            const events = new Map(page.evaluate('observedWorker.messages').map(({key, value}) => [key, value]));
            assert.equal(events.get(path.startsWith('vaft/') ? 'UpdateDeviceId' : 'UboUpdateDeviceId'), 'fixture-device');
            assert.equal(events.get('UpdateClientIntegrityHeader'), 'fixture-integrity');
            assert.equal(events.get('UpdateAuthorizationHeader'), 'fixture-authorization');
            if (path.startsWith('vaft/')) {
                assert.equal(events.get('UpdateClientVersion'), 'fixture-version');
                assert.equal(events.get('UpdateClientSession'), 'fixture-session');
            }
            const offOriginBody = json(playback);
            await page.run(`fetch(${json(unrelated)}, {method: 'POST', headers: {}, body: ${json(offOriginBody)}})`);
            assert.equal(page.evaluate('requests.at(-1).body'), offOriginBody);
            const miniPlayer = json({operationName: 'PlaybackAccessToken', variables: {playerType: 'picture-by-picture'}});
            await page.run(`fetch(${json(gqlUrl)}, {method: 'POST', headers: {}, body: ${json(miniPlayer)}})`);
            assert.equal(page.evaluate('requests.at(-1).body'), '');
            await page.run(`fetch(new Request(${json(gqlUrl)}, {method: 'POST', body: ${json(miniPlayer)}}))`);
            assert.equal(page.evaluate('requests.at(-1).body'), '');
            const original = [
                { operationName: 'UnrelatedOperation', variables: { playerType: 'keep' } },
                { operationName: 'PlaybackAccessToken', variables: { playerType: 'frontpage' } },
            ];
            await page.run(`fetch(new Request(${json(gqlUrl)}, {
                method: 'POST',
                headers: new Headers([['authorization', 'fixture-only']]),
                body: ${json(json(original))}
            }))`);
            const observed = page.evaluate('requests.at(-1)');
            const operations = JSON.parse(observed.body);
            assert.equal(operations[0].variables.playerType, 'keep', 'sibling GraphQL payload is unchanged');
            assert.equal(operations[1].variables.playerType, 'popout', 'playback operation still reaches the configured player type');
            assert.equal(page.run('AuthorizationHeader'), 'fixture-only');
        },
    },
    {
        name: 'handles relative playlist variants and preserves an unchanged response',
        async run(source, path) {
            const page = loadScript(source, path);
            const worker = loadWorker(page);
            const relative = './fixture/quality.m3u8?sig=dummy';
            const resolved = 'https://usher.ttvnw.net/api/channel/hls/fixture/quality.m3u8?sig=dummy';
            const body = masterPlaylist(relative, { codecs: false });
            fixture(worker, masterUrl, body, {headers: {'x-fixture': 'kept'}});
            fixture(worker, resolved, plainMedia);

            const initial = await outcome(worker.run(`fetch(${json(masterUrl)})`));
            assert.equal(initial.state, 'fulfilled', 'optional playlist metadata does not block playback');
            assert.equal(initial.value.url, masterUrl, 'unchanged playlist keeps its resolution base URL');
            assert.equal(initial.value.headers.get('x-fixture'), 'kept');
            assert.equal(await initial.value.text(), body);
            const refreshed = await outcome(worker.run(`fetch(${json(masterUrl)})`));
            assert.equal(refreshed.state, 'fulfilled', 'relative query-bearing variants are valid during cache health checks');
            assert.ok(worker.evaluate('requests').some(record => record.url === resolved));
            worker.run(`processM3U8 = async () => { throw new Error('fixture media transform failed'); };`);
            const restoredMedia = await outcome(worker.run(`fetch(${json(resolved)})`));
            assert.equal(restoredMedia.state, 'fulfilled', 'optional media rewriting falls back to the downloaded bytes');
            assert.equal(restoredMedia.value.url, resolved);
            assert.equal(await restoredMedia.value.text(), plainMedia);

            const secondChannel = masterUrl.replace('/test.m3u8', '/second.m3u8');
            fixture(worker, secondChannel, body, { headers: { 'x-fixture': 'fallback' } });
            worker.run(`parseAttributes = () => { throw new Error('fixture master transform failed'); };`);
            const restoredMaster = await outcome(worker.run(`fetch(${json(secondChannel)})`));
            assert.equal(restoredMaster.state, 'fulfilled', 'optional master rewriting falls back to the downloaded bytes');
            assert.equal(restoredMaster.value.url, secondChannel);
            assert.equal(restoredMaster.value.headers.get('x-fixture'), 'fallback');
            assert.equal(await restoredMaster.value.text(), body);

            const reload = (await playback(source, path)).worker;
            const refreshedMaster = masterUrl + '&p=2&sig=second&token=dummy';
            const modified = masterPlaylist(mediaUrl) + '# cached playback choice\n';
            fixture(reload, refreshedMaster, masterPlaylist(mediaUrl));
            reload.run(`
                const originalStream = StreamInfos.test;
                if (typeof AdSignifier !== 'undefined') {
                    originalStream.ModifiedM3U8 = ${json(modified)};
                    originalStream.IsUsingModifiedM3U8 = true;
                } else {
                    originalStream.BackupEncodings = ${json(modified)};
                }
            `);
            const reloaded = await outcome(reload.run(`fetch(${json(refreshedMaster)})`));
            assert.equal(reloaded.state, 'fulfilled');
            assert.equal(reload.run('StreamInfos.test === originalStream'), true, 'rotating master query parameters retain channel state');
            assert.equal(await reloaded.value.text(), modified, 'player reload receives the prepared playlist');

            const backup = (await playback(source, path)).worker;
            backup.run(`
                if (typeof PlayerReloadMinimalRequestsTime !== 'undefined') PlayerReloadMinimalRequestsTime = 0;
                graphQLResponse = {status: 200, body: JSON.stringify({
                    data: {streamPlaybackAccessToken: {signature: 'dummy-sig', value: 'dummy-token'}}
                })};
            `);
            const backupMaster = `${masterUrl}&sig=dummy-sig&token=dummy-token`;
            const backupRelative = './fixture/backup-quality.m3u8?sig=dummy';
            const backupUrl = 'https://usher.ttvnw.net/api/channel/hls/fixture/backup-quality.m3u8?sig=dummy';
            fixture(backup, backupMaster, masterPlaylist(backupRelative));
            fixture(backup, backupUrl, '#EXTM3U\n#EXTINF:1,live\n./segment.ts\n');
            fixture(backup, mediaUrl, adMedia);
            const switched = await outcome(backup.run(`fetch(${json(mediaUrl)})`));
            assert.equal(switched.state, 'fulfilled', 'backup stream still serves media');
            assert.equal(switched.value.url, mediaUrl);
            assert.match(await switched.value.text(), /https:\/\/usher\.ttvnw\.net\/api\/channel\/hls\/fixture\/segment\.ts/);
        },
    },
    {
        name: 'retries backup playback on a later ad break after temporary failure',
        only: 'video-swap-new',
        async run(source, path) {
            const { worker } = await playback(source, path);
            worker.run(`
                OPT_BACKUP_PLAYER_TYPES = ['fixture'];
                graphQLResponse = { status: 503, body: '{}' };
            `);
            fixture(worker, mediaUrl, adMedia);
            const first = await outcome(worker.run(`fetch(${json(mediaUrl)})`));
            assert.equal(first.state, 'fulfilled');
            assert.equal(worker.evaluate("workerMessages.filter(m => m.key === 'FetchRequest').length"), 1);
            fixture(worker, mediaUrl, plainMedia);
            await worker.run(`fetch(${json(mediaUrl)})`);
            fixture(worker, mediaUrl, adMedia);
            await worker.run(`fetch(${json(mediaUrl)})`);
            assert.equal(worker.evaluate("workerMessages.filter(m => m.key === 'FetchRequest').length"), 2);
        },
    },
    {
        name: 'keeps newer preferences and restores absent slots',
        legacy: true,
        async run(source, path) {
            const page = loadScript(source, path);
            const result = page.evaluate(`(() => {
                const activity = installPlayer();
                localStorage.setItem('volume', '0.1');
                dispatch('DOMContentLoaded');
                reloadTwitchPlayer(false);
                localStorage.setItem('volume', '0.9');
                advance(3000);
                return { activity, volume: localStorage.getItem('volume'),
                    quality: localStorage.getItem('video-quality'), muted: localStorage.getItem('video-muted') };
            })()`);
            assert.ok(result.activity.includes('reload'), 'failure-path fixture actually reloads the player');
            assert.equal(result.volume, '0.9', 'fresh volume choice survives delayed restore');
            assert.equal(result.quality, null, 'previously absent quality remains absent');
            assert.equal(result.muted, null, 'previously absent mute remains absent');

            const overlap = loadScript(source, path).evaluate(`(() => {
                installPlayer();
                if (typeof ReloadPlayerDelay !== 'undefined') ReloadPlayerDelay = 0;
                localStorage.setItem('volume', '0.1');
                dispatch('DOMContentLoaded');
                reloadTwitchPlayer(false);
                advance(1000);
                localStorage.setItem('volume', '0.9');
                reloadTwitchPlayer(false);
                advance(2000);
                const during = localStorage.getItem('volume');
                advance(1000);
                return { during, after: localStorage.getItem('volume') };
            })()`);
            assert.deepEqual(overlap, { during: '0.4', after: '0.9' }, 'the newer reload owns its own restore');
        },
    },
    {
        name: 'releases retired workers and generated Blob URLs',
        legacy: true,
        async run(source, path) {
            if (path.startsWith('strip/')) {
                const { page, worker } = await playback(source, path);
                assert.equal(page.run('objectUrls.size'), 1);
                page.run("capturedWorkers[0].emit('message', {key: 'fixture-ready'})");
                assert.equal(page.run('objectUrls.size'), 0);
                worker.run(`AdSegmentCache.set('https://cdn.invalid/expired.ts', Date.now() - 120001);`);
                const media = await outcome(worker.run(`fetch(${json(mediaUrl)})`));
                assert.equal(media.state, 'fulfilled');
                assert.equal(worker.run('AdSegmentCache.size'), 0);
                return;
            }
            const page = loadScript(source, path);
            const result = page.evaluate(`(() => {
                const older = new Worker('blob:https://www.twitch.tv/old');
                const active = new Worker('blob:https://www.twitch.tv/current');
                older.terminate();
                simulateAds(1);
                const waiting = objectUrls.size;
                active.emit('message', {key: 'fixture-ready'});
                return { stale: older.messages.length, active: active.messages.length,
                    waiting, retained: objectUrls.size, retired: older.terminated, revoked: revoked.length };
            })()`);
            assert.deepEqual(result, { stale: 0, active: 1, waiting: 1, retained: 0, retired: true, revoked: 2 });

            const worker = (await playback(source, path)).worker;
            for (let i = 0; i < 18; i++) {
                const nextMaster = masterUrl.replace('/test.m3u8', `/channel${i}.m3u8`);
                const nextMedia = `${host}/channel${i}.m3u8`;
                fixture(worker, nextMaster, masterPlaylist(nextMedia));
                fixture(worker, nextMedia, plainMedia);
                const result = await outcome(worker.run(`fetch(${json(nextMaster)})`));
                assert.equal(result.state, 'fulfilled');
            }
            assert.equal(worker.run('Object.keys(StreamInfos).length'), 16);
            assert.equal(worker.run(`StreamInfosByUrl[${json(mediaUrl)}]`), undefined);
            assert.equal(worker.run(`StreamInfosByUrl[${json(`${host}/channel17.m3u8`)}].ChannelName`), 'channel17');

            const lastMaster = masterUrl.replace('/test.m3u8', '/channel17.m3u8');
            const retiredMedia = `${host}/channel17.m3u8`;
            const newMedia = `${host}/channel17-restarted.m3u8`;
            fixture(worker, retiredMedia, '', {status: 404});
            fixture(worker, newMedia, plainMedia);
            fixture(worker, lastMaster, masterPlaylist(newMedia));
            const restarted = await outcome(worker.run(`fetch(${json(lastMaster)})`));
            assert.equal(restarted.state, 'fulfilled');
            assert.equal(worker.run(`StreamInfosByUrl[${json(retiredMedia)}]`), undefined);
            assert.equal(worker.run(`StreamInfosByUrl[${json(newMedia)}].ChannelName`), 'channel17');

            const stalled = (await playback(source, path)).worker;
            fixture(stalled, mediaUrl, adMedia);
            stalled.run(`
                if (typeof BackupPlayerTypes !== 'undefined') {
                    BackupPlayerTypes = ['fixture'];
                    PlayerReloadMinimalRequestsTime = 0;
                } else OPT_BACKUP_PLAYER_TYPES = ['fixture'];
            `);
            const request = stalled.run(`fetch(${json(mediaUrl)})`);
            assert.equal((await outcome(request)).state, 'pending', 'fixture is waiting for the worker relay');
            stalled.run('advance(10000)');
            assert.equal((await outcome(request)).state, 'fulfilled', 'timed-out relay leaves playback with a playlist');
            assert.equal(stalled.run('pendingFetchRequests.size'), 0);

        },
    },
    {
        name: 'takes over from an upstream copy that loaded first',
        async run(source, path) {
            // Upstream pixeltris builds use version 24 at most and leave a Worker class naming twitch.
            const page = loadScript('', 'empty.js');
            page.run(`
                window.twitchAdSolutionsVersion = 24;
                window.Worker = class extends Worker { upstream() { return 'twitch upstream hook'; } };
            `);
            page.run(source, path);
            const worker = page.run(`new Worker('blob:https://www.twitch.tv/player-fixture')`);
            assert.ok(worker.source, 'the fork wraps the player worker');
            assert.equal(typeof worker.upstream, 'undefined', 'the upstream Worker class is removed');

            const newer = loadScript('', 'empty.js');
            newer.run('window.twitchAdSolutionsVersion = 1000;');
            newer.run(source, path);
            assert.equal(newer.run(`new Worker('blob:https://www.twitch.tv/player-fixture').source`), undefined,
                'a newer copy that loaded first keeps control');
        },
    },
];

module.exports = { cases };
