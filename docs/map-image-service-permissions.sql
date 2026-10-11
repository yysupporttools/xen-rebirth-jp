-- Image replacement uses a service-only SECURITY INVOKER function.
grant select on public.game_maps to service_role;
grant update (map_image_url, source_image_hash, image_source, image_revision, image_width, image_height, updated_at) on public.game_maps to service_role;
