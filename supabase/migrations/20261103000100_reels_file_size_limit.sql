-- Limit new Reel uploads to 30 MB.
update storage.buckets
set file_size_limit = 31457280
where id = 'reels';
