# Japan Heroes guild showcase

Public home sidebar: `dist/index.html#guild-showcase`.
Editor: `dist/guild.html`, also linked from the home sidebar and the shared utility menu.
The editor reuses the site's board administrator session and role check. Guests can only view published profiles.

Initial public content provided by the site owner on 2026-10-08:
- Japan Heroes, guild level 4, total guild membership 31.
- Intro: ギルドメンバー全員日本人プレイヤーで構成されており、新人も玄人も在籍中。新規加入も募集しています。
- Gallery order: Alone (ギルドマスター), ARCO, colina, soyopy, Gura, XperoX.
- All self-introductions are blank until supplied. The public UI says they are being prepared.
- Six original game screenshots are stored unchanged in `dist/assets/guild/` with lowercase member filenames. They were supplied by the site owner; they are not AI illustrations.

The total guild membership and number of gallery profiles are separate values. Adding a profile does not change the whole-guild member count.
The gallery advances every 8 seconds by default, with previous/next and pause controls. Hover, keyboard focus, hidden tabs and reduced-motion preference pause automatic transitions. Photographs use contain sizing without cropping.
At 1840px and wider, the new 238px panel uses the left margin. Narrower layouts place it before the main home content, and small screens stack introduction and gallery.

To update, open the editor, sign in with an existing board administrator account, and save the guild or member form. Photos support clipboard paste, file selection and drag/drop. Individual members can be hidden or reordered. Removing a member uses a soft deletion.
Shared data are stored through the `guild-showcase` Edge Function and service-only RPCs. Private tables have RLS and no browser grants. Uploaded photos use a public delivery bucket with service-only writes. API public reads do not expose administrator IDs or storage paths.
Admin pages are excluded from search indexing and article popularity tracking.
