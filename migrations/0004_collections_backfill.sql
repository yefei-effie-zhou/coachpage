PRAGMA defer_foreign_keys=ON;

INSERT INTO app_schema_migrations
      (version,name,checksum,state,source_epoch,source_head,started_at,report_json)
      VALUES (1,'collections-backfill','9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4','started','70d0ee17-ff63-48a8-96fe-73d9ef019423',169,'2026-11-23T10:18:27.912Z','{}')
      ON CONFLICT(version) DO UPDATE SET
        name=excluded.name,
        state=app_schema_migrations.state
      WHERE app_schema_migrations.checksum=excluded.checksum;

DELETE FROM collection_migration_object_json_chunks
      WHERE migration_version=1;

DELETE FROM collection_migration_source_objects
      WHERE migration_version=1;

DELETE FROM collection_migration_target_rows
      WHERE migration_version=1;

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','0c61e75a-d4d0-4ca6-879c-02036f7a9a61',157,0,
        '7acb90071b94448b7d8cedd3d549fdc382eb890a017752a6bd57bc610deb2f03',1,
        171,0,'fb49e40538f8fb98ef9bbe27b6fabe65452a55ff2a288805aeea42e400bab1d2',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','0c61e75a-d4d0-4ca6-879c-02036f7a9a61','source',0,'{"id":"0c61e75a-d4d0-4ca6-879c-02036f7a9a61","created_at":"2026-11-17T21:42:02.273Z","updated_at":"2026-11-17T21:42:02.273Z","name":"火锅森","url":"","topic":"","description":"14 【北美公司面试！薪资低于预期怎么回答💸 - 火锅森 | 小红书 - 你的生活兴趣社区】 😆 KxhuOjLskgXwy4r 😆 https://www.xiaohongshu.com/discovery/item/69d7cb43000000002102d103?source=webshare&xhsshare=pc_web&xsec_token=ABaaILZXLe9V8DqPG60nxxFM4LTukr9zwHsG9I8ry3en4=&xsec_source=pc_share","emoji":"","type":"project","language_id":null,"language":"不限语言","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','0c61e75a-d4d0-4ca6-879c-02036f7a9a61','target',0,'{"id":"0c61e75a-d4d0-4ca6-879c-02036f7a9a61","created_at":"2026-11-17T21:42:02.273Z","updated_at":"2026-11-17T21:42:02.273Z","name":"火锅森","url":"","topic":"","description":"14 【北美公司面试！薪资低于预期怎么回答💸 - 火锅森 | 小红书 - 你的生活兴趣社区】 😆 KxhuOjLskgXwy4r 😆 https://www.xiaohongshu.com/discovery/item/69d7cb43000000002102d103?source=webshare&xhsshare=pc_web&xsec_token=ABaaILZXLe9V8DqPG60nxxFM4LTukr9zwHsG9I8ry3en4=&xsec_source=pc_share","emoji":"","type":"project","language_id":null,"language":"不限语言","status":"backlog","completed_at":"","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','291f5066-956c-4811-9580-052bb98af607',162,0,
        'e2f1a9dff942a69defc0d7414ff915172bbcd322afbc5cced11100667dd9f16c',1,
        172,0,'d6f302751020b1610833505e7e3c1897d6fdd7758cc0ea1c7bd32d9d3f4dd6c3',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','291f5066-956c-4811-9580-052bb98af607','source',0,'{"id":"291f5066-956c-4811-9580-052bb98af607","created_at":"2026-11-18T09:30:23.588Z","updated_at":"2026-11-18T09:31:34.047Z","name":"和田雅成　わだまさなり","url":"","topic":"","description":"和田雅成 入坑小指南（更新至舞台剧） 欢迎大家捉虫/... \nhttps://xhslink.cn/o/96Jk5WIaaZX\n\n要饭吃 https://xhslink.cn/o/7hg8vmwY1p9","emoji":"🇯🇵","type":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','291f5066-956c-4811-9580-052bb98af607','target',0,'{"id":"291f5066-956c-4811-9580-052bb98af607","created_at":"2026-11-18T09:30:23.588Z","updated_at":"2026-11-18T09:31:34.047Z","name":"和田雅成　わだまさなり","url":"","topic":"","description":"和田雅成 入坑小指南（更新至舞台剧） 欢迎大家捉虫/... \nhttps://xhslink.cn/o/96Jk5WIaaZX\n\n要饭吃 https://xhslink.cn/o/7hg8vmwY1p9","emoji":"🇯🇵","type":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"backlog","completed_at":"","tag_ids":["tag_migrated_8a88fbb234ec0452991a7127"],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','429c1f22-2c74-4db0-9ae6-a10e4809554b',166,0,
        '2620581d612893864886bab43137cb271de944f280bf9395c988b1e44cc2b6aa',1,
        173,0,'48f53c4efcd998b32d3c185f4e9d1df1c864818f72cda2d368b18390db934113',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','429c1f22-2c74-4db0-9ae6-a10e4809554b','source',0,'{"id":"429c1f22-2c74-4db0-9ae6-a10e4809554b","created_at":"2026-11-15T20:07:45.082Z","updated_at":"2026-11-18T09:40:16.333Z","name":"杀死你的旅途","url":"","topic":"","description":"gay！黑道给！","emoji":"🎬","type":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"completed","completed_at":"2026-11-18T09:40:15.799Z"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','429c1f22-2c74-4db0-9ae6-a10e4809554b','target',0,'{"id":"429c1f22-2c74-4db0-9ae6-a10e4809554b","created_at":"2026-11-15T20:07:45.082Z","updated_at":"2026-11-18T09:40:16.333Z","name":"杀死你的旅途","url":"","topic":"","description":"gay！黑道给！","emoji":"🎬","type":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"completed","completed_at":"2026-11-18T09:40:15.799Z","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','4bb69c1b-8294-4255-91fc-e35cf36ff309',168,0,
        '39241b091bfced39701599bb658178c4a722edb75539f4637de4e9dc919fe709',1,
        174,0,'92b6856b9a388610b9541d98e0507c27a5492b7cdb0aa7d2899ec2a3f54ea0f0',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','4bb69c1b-8294-4255-91fc-e35cf36ff309','source',0,'{"id":"4bb69c1b-8294-4255-91fc-e35cf36ff309","created_at":"2026-11-18T09:42:06.322Z","updated_at":"2026-11-18T09:42:06.322Z","name":"小妈abo","url":"https://xhslink.cn/o/7ozeZ5ps1kr","topic":"","description":"五夏——小妈(二) 哦哦哦在@人生难得我乐意 的催更下 ... https://xhslink.cn/o/7ozeZ5ps1kr","emoji":"","type":"c4cfcc3a-5f2a-4482-a938-0e2691439706","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","language":"中文","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','4bb69c1b-8294-4255-91fc-e35cf36ff309','target',0,'{"id":"4bb69c1b-8294-4255-91fc-e35cf36ff309","created_at":"2026-11-18T09:42:06.322Z","updated_at":"2026-11-18T09:42:06.322Z","name":"小妈abo","url":"https://xhslink.cn/o/7ozeZ5ps1kr","topic":"","description":"五夏——小妈(二) 哦哦哦在@人生难得我乐意 的催更下 ... https://xhslink.cn/o/7ozeZ5ps1kr","emoji":"","type":"c4cfcc3a-5f2a-4482-a938-0e2691439706","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","language":"中文","status":"backlog","completed_at":"","tag_ids":["tag_migrated_865ba65319c0ba3af3473beb"],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','50995e32-4708-48a8-b20c-8a30d3573ab7',160,0,
        '66ebcece3c7e1d692504dd68a0df531401ebcd88f8823220a6e9902700c4a426',1,
        175,0,'5626fae229f935f110eaee240c3bf1438dfcd4ba945d378cba7a38edc84de4df',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','50995e32-4708-48a8-b20c-8a30d3573ab7','source',0,'{"id":"50995e32-4708-48a8-b20c-8a30d3573ab7","created_at":"2026-11-18T09:27:43.787Z","updated_at":"2026-11-18T09:27:43.787Z","name":"新闻编辑室","url":"","topic":"","description":"牛逼就完了\nOnly doctor can say she''s dead.","emoji":"🎬","type":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","language":"English","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','50995e32-4708-48a8-b20c-8a30d3573ab7','target',0,'{"id":"50995e32-4708-48a8-b20c-8a30d3573ab7","created_at":"2026-11-18T09:27:43.787Z","updated_at":"2026-11-18T09:27:43.787Z","name":"新闻编辑室","url":"","topic":"","description":"牛逼就完了\nOnly doctor can say she''s dead.","emoji":"🎬","type":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","language":"English","status":"backlog","completed_at":"","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','69dfa2b7-690f-4e34-86fe-259cbebbc8cf',158,0,
        '0f43e2b29151238d618920350d37169f4ec62ca448a8b3ca28610fe248fd5b84',1,
        176,0,'cef623f755fe9620b514b0f4b6f4135691898db9fa75b293bfeefdaadb75b766',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','69dfa2b7-690f-4e34-86fe-259cbebbc8cf','source',0,'{"id":"69dfa2b7-690f-4e34-86fe-259cbebbc8cf","created_at":"2026-11-17T21:25:30.728Z","updated_at":"2026-11-17T21:42:29.036Z","name":"职业天赋分析","url":"https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share","topic":"","description":"59 【看了这个姐妹的分享我去找了ds老师 - 欧阳牛牛oynn | 小红书 - 你的生活兴趣社区】 😆 eRBWJiGB7bBk4Nq 😆 https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share\n\n79 【这个prompt可以帮你找到你以前不知道自己能 - 芥末AI日记 | 小红书 - 你的生活兴趣社区】 😆 4gvC2lD0l1m1ky9 😆 https://www.xiaohongshu.com/discovery/item/69c66f3f000000001a02db60?source=webshare&xhsshare=pc_web&xsec_token=ABvKS_YGA7eIR8Xk727x-eFHg2zEJCjiOoLw3peV8fO2U=&xsec_source=","emoji":"","type":"project","language_id":null,"language":"不限语言","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','69dfa2b7-690f-4e34-86fe-259cbebbc8cf','target',0,'{"id":"69dfa2b7-690f-4e34-86fe-259cbebbc8cf","created_at":"2026-11-17T21:25:30.728Z","updated_at":"2026-11-17T21:42:29.036Z","name":"职业天赋分析","url":"https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share","topic":"","description":"59 【看了这个姐妹的分享我去找了ds老师 - 欧阳牛牛oynn | 小红书 - 你的生活兴趣社区】 😆 eRBWJiGB7bBk4Nq 😆 https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share\n\n79 【这个prompt可以帮你找到你以前不知道自己能 - 芥末AI日记 | 小红书 - 你的生活兴趣社区】 😆 4gvC2lD0l1m1ky9 😆 https://www.xiaohongshu.com/discovery/item/69c66f3f000000001a02db60?source=webshare&xhsshare=pc_web&xsec_token=ABvKS_YGA7eIR8Xk727x-eFHg2zEJCjiOoLw3peV8fO2U=&xsec_source=","emoji":"","type":"project","language_id":null,"language":"不限语言","status":"backlog","completed_at":"","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','c96d7782-a18a-4708-87bd-b69caa85cc41',163,0,
        '96cbbd283aa04bb7cf8cdd20e31fe04d4e3913fc402b32870491f9e847365771',1,
        177,0,'0f10450f2f202e195b589c28de0d13250a9a83c9ad6b9a11cb5b4fc47dfa82ed',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','c96d7782-a18a-4708-87bd-b69caa85cc41','source',0,'{"id":"c96d7782-a18a-4708-87bd-b69caa85cc41","created_at":"2026-11-18T09:32:40.964Z","updated_at":"2026-11-18T09:32:40.964Z","name":"由你主动吻我吧","url":"","topic":"","description":"日腐 给！","emoji":"🇯🇵","type":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','c96d7782-a18a-4708-87bd-b69caa85cc41','target',0,'{"id":"c96d7782-a18a-4708-87bd-b69caa85cc41","created_at":"2026-11-18T09:32:40.964Z","updated_at":"2026-11-18T09:32:40.964Z","name":"由你主动吻我吧","url":"","topic":"","description":"日腐 给！","emoji":"🇯🇵","type":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","language":"日本語","status":"backlog","completed_at":"","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtqb4n6a',110,0,
        'fa124bb68e276806fccedb23ccd8ba6afd16bbc9b4d945c618308fedeec7ee70',1,
        178,0,'97f4bdbae41500a2f03c14daebe94ba638f986ba64b5414bc561fc53e1800f47',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb4n6a','source',0,'{"id":"resource-mtqb4n6a","name":"JLPT刷题","url":"https://dethitiengnhat.com/en","type":"website","language":"日本語","topic":"日语学习","description":"刷题网站","emoji":"🇯🇵","status":"backlog","completed_at":"","created_at":"2026-09-06T21:11:50.866Z","updated_at":"2026-09-20T19:52:50.865Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb4n6a','target',0,'{"id":"resource-mtqb4n6a","name":"JLPT刷题","url":"https://dethitiengnhat.com/en","type":"website","language":"日本語","topic":"日语学习","description":"刷题网站","emoji":"🇯🇵","status":"backlog","completed_at":"","created_at":"2026-09-06T21:11:50.866Z","updated_at":"2026-09-20T19:52:50.865Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtqb76vn',111,0,
        'f5d4f312f588f5b18c8081a2fe6b203f5a546c21c5820f13a1a6f08770feef06',1,
        179,0,'5e4b0dcfe73caf3c5a5170c8b169d591b33475d9e7376400526ba52c7b9a5a71',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb76vn','source',0,'{"id":"resource-mtqb76vn","name":"待命警察 On Call","url":"","type":"movie_series","language":"English","topic":"美剧","description":"俩警察在加油站看到一个爹和妈吵架后来爹自焚了\n好看！节奏紧凑！喜欢喜欢！","emoji":"","status":"completed","completed_at":"2026-09-29T09:43:01.993Z","created_at":"2026-09-06T21:13:49.715Z","updated_at":"2026-09-29T09:43:02.114Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb76vn','target',0,'{"id":"resource-mtqb76vn","name":"待命警察 On Call","url":"","type":"movie_series","language":"English","topic":"美剧","description":"俩警察在加油站看到一个爹和妈吵架后来爹自焚了\n好看！节奏紧凑！喜欢喜欢！","emoji":"","status":"completed","completed_at":"2026-09-29T09:43:01.993Z","created_at":"2026-09-06T21:13:49.715Z","updated_at":"2026-09-29T09:43:02.114Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtqb83z0',112,0,
        '23e9c54bc5732b94debbae8eb9852f48581323ebe2e8b6628c900e761040538b',1,
        180,0,'ca9e8333c321865e77e5cb9dfc1fa2661df7198fa0607c17ad954481394b0355',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb83z0','source',0,'{"id":"resource-mtqb83z0","name":"Tsunahiro","url":"https://tsunagarujp.mext.go.jp/?lang_id=EN","type":"website","language":"日本語","topic":"日语学习","description":"Website for Foreign Nationals as Residents to Learn Japanese Language\nConnect and Enhance Your Life in Japanese","emoji":"🇯🇵","status":"backlog","completed_at":"","created_at":"2026-09-06T21:14:32.604Z","updated_at":"2026-09-20T19:52:50.755Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb83z0','target',0,'{"id":"resource-mtqb83z0","name":"Tsunahiro","url":"https://tsunagarujp.mext.go.jp/?lang_id=EN","type":"website","language":"日本語","topic":"日语学习","description":"Website for Foreign Nationals as Residents to Learn Japanese Language\nConnect and Enhance Your Life in Japanese","emoji":"🇯🇵","status":"backlog","completed_at":"","created_at":"2026-09-06T21:14:32.604Z","updated_at":"2026-09-20T19:52:50.755Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtqb8xwe',113,0,
        '59dbd63fe6ca6454e2f8113d2ca98f117104582b25a7fe6a32478dc86a640d0b',1,
        181,0,'1e719352768c09037508cb12fa5645e151220d394ff5389ebd4915a8a128ab45',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb8xwe','source',0,'{"id":"resource-mtqb8xwe","name":"Lingohut","url":"https://www.lingohut.com/zh","type":"website","language":"不限语言","topic":"","description":"啥语言都能学，是兄弟就来学外语","emoji":"🏳️‍🌈","status":"backlog","completed_at":"","created_at":"2026-09-06T21:15:11.390Z","updated_at":"2026-09-20T19:52:50.706Z","language_id":null}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqb8xwe','target',0,'{"id":"resource-mtqb8xwe","name":"Lingohut","url":"https://www.lingohut.com/zh","type":"website","language":"不限语言","topic":"","description":"啥语言都能学，是兄弟就来学外语","emoji":"🏳️‍🌈","status":"backlog","completed_at":"","created_at":"2026-09-06T21:15:11.390Z","updated_at":"2026-09-20T19:52:50.706Z","language_id":null,"tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtqba60k',114,0,
        '8720440d399d32d35cc3528f04084475cba0d0890234cf66be9969f4540edd93',1,
        182,0,'89223a2863cac7335c5fa274b5795214f8222c229ec4ce2dbeebdb39b6395fb5',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqba60k','source',0,'{"id":"resource-mtqba60k","name":"NT2 TaalMenu","url":"https://nt2taalmenu.nl/","type":"website","language":"Nederlands","topic":"荷兰语学习","description":"刷题用","emoji":"🇳🇱","status":"backlog","completed_at":"","created_at":"2026-09-06T21:16:08.564Z","updated_at":"2026-09-20T19:52:50.652Z","language_id":"lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtqba60k','target',0,'{"id":"resource-mtqba60k","name":"NT2 TaalMenu","url":"https://nt2taalmenu.nl/","type":"website","language":"Nederlands","topic":"荷兰语学习","description":"刷题用","emoji":"🇳🇱","status":"backlog","completed_at":"","created_at":"2026-09-06T21:16:08.564Z","updated_at":"2026-09-20T19:52:50.652Z","language_id":"lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyuail8',115,0,
        'a4bc75831667133270f2267acc9df317f1cf35b77401152ef3502faabff6a9f5',1,
        183,0,'3af2ce014a00ffaf90c56aa13d27d02eaa2cc44de1b94880ee3ea66fc5a530a8',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuail8','source',0,'{"id":"resource-mtyuail8","name":"如果回到结婚前","url":"","type":"book","language":"中文","topic":"","description":"温柔占有欲年下1x直球美人0 卧槽啊 给！！","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T20:30:26.972Z","updated_at":"2026-09-20T19:52:50.601Z","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuail8','target',0,'{"id":"resource-mtyuail8","name":"如果回到结婚前","url":"","type":"book","language":"中文","topic":"","description":"温柔占有欲年下1x直球美人0 卧槽啊 给！！","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T20:30:26.972Z","updated_at":"2026-09-20T19:52:50.601Z","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyujgtr',116,0,
        '651f275a11f80b94e2fcb9e2ad00b548c405ae74409ec84ed6f231c507ab56ea',1,
        184,0,'ce19f9618df91fec811bbd86d1b63f5ddc96911d657adc56820fc5cbc8ed096b',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyujgtr','source',0,'{"id":"resource-mtyujgtr","name":"可能的爱情","url":"","type":"movie_series","language":"不限语言","topic":"","description":"超牛逼\n无敌好看，羡慕还没看过的眼睛，还能够一无所知地走进电影院被从头到尾震撼一次，见证一次神降临的瞬间","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:37:24.591Z","updated_at":"2026-09-20T19:52:50.540Z","language_id":null}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyujgtr','target',0,'{"id":"resource-mtyujgtr","name":"可能的爱情","url":"","type":"movie_series","language":"不限语言","topic":"","description":"超牛逼\n无敌好看，羡慕还没看过的眼睛，还能够一无所知地走进电影院被从头到尾震撼一次，见证一次神降临的瞬间","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:37:24.591Z","updated_at":"2026-09-20T19:52:50.540Z","language_id":null,"tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyuowjn',117,0,
        '993fbc42f6855fca8744604d86d810709c1841df335635e3159ee8d83fcf560b',1,
        185,0,'5de7f558615732d8e343124e82f8a8d87d2e6736853a5cdd93beecf7ccc6ecff',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuowjn','source',0,'{"id":"resource-mtyuowjn","name":"The Marvelous Mrs. Maisel 了不起的麦瑟尔夫人","url":"","type":"movie_series","language":"English","topic":"","description":"一个能忘面试的人，和一个能等面试7小时的人","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:41:38.243Z","updated_at":"2026-09-20T19:52:50.483Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuowjn','target',0,'{"id":"resource-mtyuowjn","name":"The Marvelous Mrs. Maisel 了不起的麦瑟尔夫人","url":"","type":"movie_series","language":"English","topic":"","description":"一个能忘面试的人，和一个能等面试7小时的人","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:41:38.243Z","updated_at":"2026-09-20T19:52:50.483Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyuqw2p',118,0,
        'f60f139b9d0076b83797d975ab8bc7a763f802042358280370e70f93c29dfdbf',1,
        186,0,'b001f967fb5614d55c74a1e04a5229f058987fd73f93f85adef26c8cd6389dff',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuqw2p','source',0,'{"id":"resource-mtyuqw2p","name":"25时赤坂见","url":"","type":"movie_series","language":"日本語","topic":"","description":"给","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:43:10.945Z","updated_at":"2026-09-20T19:52:50.431Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuqw2p','target',0,'{"id":"resource-mtyuqw2p","name":"25时赤坂见","url":"","type":"movie_series","language":"日本語","topic":"","description":"给","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:43:10.945Z","updated_at":"2026-09-20T19:52:50.431Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyuuy8y',119,0,
        'b8d47a932075ed3d20e2044023d5ba2de15ed498846e621aceb9a6eeb5d01a23',1,
        187,0,'6ecf40b958c78502f58ed89baf4ad62f9fc022d1b58a2d024b231abcfe09e8db',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuuy8y','source',0,'{"id":"resource-mtyuuy8y","name":"the big short 大空头","url":"","type":"movie_series","language":"English","topic":"","description":"This is my quant! My quantitive!","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:46:20.386Z","updated_at":"2026-09-20T19:52:50.375Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyuuy8y','target',0,'{"id":"resource-mtyuuy8y","name":"the big short 大空头","url":"","type":"movie_series","language":"English","topic":"","description":"This is my quant! My quantitive!","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:46:20.386Z","updated_at":"2026-09-20T19:52:50.375Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyv3sx5',120,0,
        '58f7f2fdb7d1c2b0e19f58f85523cd30dbc3e00909d887e3fd433dd2556bb8c6',1,
        188,0,'a1f985239e4903e6c2c8a6a34979c94d6923a5d02d058e3a85f8373f121dbc8f',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyv3sx5','source',0,'{"id":"resource-mtyv3sx5","name":"波士顿法律","url":"","type":"movie_series","language":"English","topic":"","description":"间歇性精神障碍杀人辩护","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:53:13.385Z","updated_at":"2026-09-20T19:52:50.327Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyv3sx5','target',0,'{"id":"resource-mtyv3sx5","name":"波士顿法律","url":"","type":"movie_series","language":"English","topic":"","description":"间歇性精神障碍杀人辩护","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:53:13.385Z","updated_at":"2026-09-20T19:52:50.327Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyv8pml',121,0,
        '42bc2cee5d950f2ed59031c0d7b813a6ee2cba9c8ebf396b16d5094c1c322ac0',1,
        189,0,'365de68af0da9507c4b3d6a2ef4f94f1f80c39267daada3eaf9b1d01834eef71',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyv8pml','source',0,'{"id":"resource-mtyv8pml","name":"Hacks 绝望写手","url":"","type":"movie_series","language":"English","topic":"","description":"每周女巫审判现场为您报道","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:57:02.397Z","updated_at":"2026-09-20T19:52:50.272Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyv8pml','target',0,'{"id":"resource-mtyv8pml","name":"Hacks 绝望写手","url":"","type":"movie_series","language":"English","topic":"","description":"每周女巫审判现场为您报道","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T20:57:02.397Z","updated_at":"2026-09-20T19:52:50.272Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyvh5eq',122,0,
        '8f642821cbfb445d38fe9a1d5d93ed08c9ab77e3f74f0ec22024a95bf0b2bbd5',1,
        190,0,'8324496711bec6ea3a68ba64a9660f7087b6db62d21640fcb7bf8c993c6bf131',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyvh5eq','source',0,'{"id":"resource-mtyvh5eq","name":"good luck 空中情缘","url":"","type":"movie_series","language":"日本語","topic":"","description":"木村拓哉当机长","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:03:36.098Z","updated_at":"2026-09-20T19:52:50.212Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyvh5eq','target',0,'{"id":"resource-mtyvh5eq","name":"good luck 空中情缘","url":"","type":"movie_series","language":"日本語","topic":"","description":"木村拓哉当机长","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:03:36.098Z","updated_at":"2026-09-20T19:52:50.212Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyvmrz3',123,0,
        '6f0246f899de69dcd334ab6e317d055607fa6bdac5604004313085f65394f5ac',1,
        191,0,'881442d0053c77453eb8d6fcf4d448297cdec69839fb6f2b7349d75c617e57dc',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyvmrz3','source',0,'{"id":"resource-mtyvmrz3","name":"The good wife 傲骨贤妻","url":"","type":"movie_series","language":"English","topic":"","description":"发疯男人最好命，will再次庭前开炮","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:07:58.623Z","updated_at":"2026-09-20T19:52:50.152Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyvmrz3','target',0,'{"id":"resource-mtyvmrz3","name":"The good wife 傲骨贤妻","url":"","type":"movie_series","language":"English","topic":"","description":"发疯男人最好命，will再次庭前开炮","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:07:58.623Z","updated_at":"2026-09-20T19:52:50.152Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtywan60',124,0,
        '6470c17c046fff5054f10708d010579c1c04a43323d507eb25d378bd9fd6cc6a',1,
        192,0,'b42d55a4e7d35930bd8534db298e76debe858e2fca1140ca2f117a503b3585a8',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywan60','source',0,'{"id":"resource-mtywan60","name":"The illusion of choice","url":"","type":"book","language":"English","topic":"","description":"自己的消费决定究竟有多少是真的“自己选的”","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T21:26:32.136Z","updated_at":"2026-10-06T18:40:36.917Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywan60','target',0,'{"id":"resource-mtywan60","name":"The illusion of choice","url":"","type":"book","language":"English","topic":"","description":"自己的消费决定究竟有多少是真的“自己选的”","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T21:26:32.136Z","updated_at":"2026-10-06T18:40:36.917Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtywdyow',125,0,
        '929bb54a62ac0f70b453a2236cf3a938d003cb3990fc9f6fa4136522fa24763c',1,
        193,0,'69681143af962d468e9dc558803f1f466caf016c4aadd161cec6db619537e8a6',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywdyow','source',0,'{"id":"resource-mtywdyow","name":"Orientalism - Edward W.Said","url":"","type":"book","language":"English","topic":"","description":"一个国家、一种文化的方式，也可能早已被某种叙事塑造。","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T21:29:07.040Z","updated_at":"2026-10-06T18:41:28.357Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywdyow','target',0,'{"id":"resource-mtywdyow","name":"Orientalism - Edward W.Said","url":"","type":"book","language":"English","topic":"","description":"一个国家、一种文化的方式，也可能早已被某种叙事塑造。","emoji":"📖","status":"backlog","completed_at":"","created_at":"2026-09-12T21:29:07.040Z","updated_at":"2026-10-06T18:41:28.357Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtywhz2r',126,0,
        'fd8ad92b847fcbd8b42754e0463f074de9f89c00713fda9623ec73785a08b9d1',1,
        194,0,'4a9395575d82e23e2d938a880d5a1763a3f97491618ac38f685cf0622e3a99a8',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywhz2r','source',0,'{"id":"resource-mtywhz2r","name":"同志亦凡人","url":"","type":"movie_series","language":"English","topic":"","description":"给！","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:32:14.163Z","updated_at":"2026-09-20T19:52:49.957Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtywhz2r','target',0,'{"id":"resource-mtywhz2r","name":"同志亦凡人","url":"","type":"movie_series","language":"English","topic":"","description":"给！","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-12T21:32:14.163Z","updated_at":"2026-09-20T19:52:49.957Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyycr8l',127,0,
        'b99acc65b6485c36960d7cd7038799c8cdccc8e7755bc61cfddcc51fced3d467',1,
        195,0,'88784c1a6ea78484d7b57a1a16e8c666951ea08f1db6b7691658bcb5850c649a',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyycr8l','source',0,'{"id":"resource-mtyycr8l","name":"FT News Briefing","url":"","type":"project","language":"English","topic":"英语听力","description":"时间短 15分钟帮你快速了解全球最重要的商业政治和经济新闻","emoji":"🎧","status":"backlog","completed_at":"","created_at":"2026-09-12T22:24:09.957Z","updated_at":"2026-10-06T18:41:56.274Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyycr8l','target',0,'{"id":"resource-mtyycr8l","name":"FT News Briefing","url":"","type":"project","language":"English","topic":"英语听力","description":"时间短 15分钟帮你快速了解全球最重要的商业政治和经济新闻","emoji":"🎧","status":"backlog","completed_at":"","created_at":"2026-09-12T22:24:09.957Z","updated_at":"2026-10-06T18:41:56.274Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mtyyn7to',145,0,
        'ce4efff9ee4fe79dcd2130c327cfbad6262be8219e62d0f0ea9315edb71fec38',1,
        196,0,'2c790466b262d2bd7201854b0365590abdecaef80e2c0420848de1754f09b3da',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyyn7to','source',0,'{"id":"resource-mtyyn7to","created_at":"2026-09-12T22:32:18.012Z","updated_at":"2026-10-14T10:48:44.558Z","name":"Easy-Vibe","url":"https://github.com/THU-SIGS-AIID/ai-vibe-coding-101","topic":"study for work","description":"零基础即可入门的 AI 原生应用实践教程。","emoji":"💻","type":"website","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","language":"English","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mtyyn7to','target',0,'{"id":"resource-mtyyn7to","created_at":"2026-09-12T22:32:18.012Z","updated_at":"2026-10-14T10:48:44.558Z","name":"Easy-Vibe","url":"https://github.com/THU-SIGS-AIID/ai-vibe-coding-101","topic":"study for work","description":"零基础即可入门的 AI 原生应用实践教程。","emoji":"💻","type":"website","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","language":"English","status":"backlog","completed_at":"","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mu1sjplw',129,0,
        '64a0e46a8d721c72cc00156ee48a14e5171b8e9e811918adbfaaeb6239ec2794',1,
        197,0,'a824bb6cffdff7f7f3494ba2d2c42e1070ea4c7f6ee367e49897a15b8231efc0',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sjplw','source',0,'{"id":"resource-mu1sjplw","name":"记忆管理局","url":"","type":"movie_series","language":"中文","topic":"","description":"好像说 像被锤了一拳一样好看\n--- 我看完了 我好懵 我真的懂了吗？","emoji":"🎬","status":"completed","completed_at":"2026-09-20T20:05:56.178Z","created_at":"2026-09-14T22:04:55.268Z","updated_at":"2026-09-20T20:06:13.309Z","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sjplw','target',0,'{"id":"resource-mu1sjplw","name":"记忆管理局","url":"","type":"movie_series","language":"中文","topic":"","description":"好像说 像被锤了一拳一样好看\n--- 我看完了 我好懵 我真的懂了吗？","emoji":"🎬","status":"completed","completed_at":"2026-09-20T20:05:56.178Z","created_at":"2026-09-14T22:04:55.268Z","updated_at":"2026-09-20T20:06:13.309Z","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mu1sncji',130,0,
        'aca39dabbbe94b3277d8f8de0c6c5949cbd52a79096eabcfd013d9ea3e57264e',1,
        198,0,'afbfce16eb76f512a6d57d429205e84588efc410757262d90c71aa248805a8c8',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sncji','source',0,'{"id":"resource-mu1sncji","name":"可能的爱情","url":"","type":"movie_series","language":"不限语言","topic":"","description":"超牛逼高分神作 等上线","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-14T22:07:44.958Z","updated_at":"2026-09-20T19:52:49.668Z","language_id":null}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sncji','target',0,'{"id":"resource-mu1sncji","name":"可能的爱情","url":"","type":"movie_series","language":"不限语言","topic":"","description":"超牛逼高分神作 等上线","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-14T22:07:44.958Z","updated_at":"2026-09-20T19:52:49.668Z","language_id":null,"tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mu1sowj8',131,0,
        'ba1cf06c51940930c0bfadd872207a1151b6c822c6967f9885e6e24fdfc9bfdb',1,
        199,0,'2593e5a3efff4a5f63d9497fb6f813c97ff0aa2110d3815d7f124f7d04191a71',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sowj8','source',0,'{"id":"resource-mu1sowj8","name":"降临","url":"","type":"movie_series","language":"English","topic":"","description":"不看不是ling人\n不好看，神神叨叨的","emoji":"🎬","status":"completed","completed_at":"2026-09-29T09:45:45.404Z","created_at":"2026-09-14T22:08:57.524Z","updated_at":"2026-09-29T09:45:45.425Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mu1sowj8','target',0,'{"id":"resource-mu1sowj8","name":"降临","url":"","type":"movie_series","language":"English","topic":"","description":"不看不是ling人\n不好看，神神叨叨的","emoji":"🎬","status":"completed","completed_at":"2026-09-29T09:45:45.404Z","created_at":"2026-09-14T22:08:57.524Z","updated_at":"2026-09-29T09:45:45.425Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mucg2pwk',132,0,
        '0e16fdf3b867a455a0aff6d0541e3403ffc06f46a8e59fa1dd106682ff0d8265',1,
        200,0,'cda58e8d159a8c4fde1512e422b7aad736c177f8cf153d51485be73c3e93598f',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mucg2pwk','source',0,'{"id":"resource-mucg2pwk","name":"Twin Peaks","url":"","type":"movie_series","language":"English","topic":"","description":"不知道是啥 上课的时候from Lucy","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-22T09:01:15.044Z","updated_at":"2026-09-22T09:01:35.167Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mucg2pwk','target',0,'{"id":"resource-mucg2pwk","name":"Twin Peaks","url":"","type":"movie_series","language":"English","topic":"","description":"不知道是啥 上课的时候from Lucy","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-09-22T09:01:15.044Z","updated_at":"2026-09-22T09:01:35.167Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6rlhl',133,0,
        '9c6f359d5c2972bb78971c953fdafe7ff70a1425f3c597479576399b1e2e3417',1,
        201,0,'81e0423b8efbc82839895880ff4ebb30c0f3c8450742e346183557a0ecf981f5',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6rlhl','source',0,'{"id":"resource-muv6rlhl","name":"邪恶力量","url":"","type":"movie_series","language":"English","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:48:16.905Z","updated_at":"2026-10-05T11:48:17.107Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6rlhl','target',0,'{"id":"resource-muv6rlhl","name":"邪恶力量","url":"","type":"movie_series","language":"English","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:48:16.905Z","updated_at":"2026-10-05T11:48:17.107Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6rz7b',134,0,
        '510672e4503695eb34bb17019afc1a3e653502bd27dec608675bb8fb160306e6',1,
        202,0,'baeafaf30620d066a5beb346f5e50a6604d9bdf22985e0180e10c95bac7d009a',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6rz7b','source',0,'{"id":"resource-muv6rz7b","name":"焦土之城","url":"","type":"movie_series","language":"English","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:48:34.679Z","updated_at":"2026-10-05T11:48:34.742Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6rz7b','target',0,'{"id":"resource-muv6rz7b","name":"焦土之城","url":"","type":"movie_series","language":"English","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:48:34.679Z","updated_at":"2026-10-05T11:48:34.742Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6sjlf',135,0,
        '4eeef8014b287356ab8169cf80a1d24ed2958940c4da920058b06dcb537e2d1d',1,
        203,0,'9b90fd404fd71eb91558b1bb67a65017840be673e95a95d652692bb347545d98',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6sjlf','source',0,'{"id":"resource-muv6sjlf","name":"异国日记","url":"","type":"movie_series","language":"日本語","topic":"","description":"忘了","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:01.107Z","updated_at":"2026-10-05T11:49:01.158Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6sjlf','target',0,'{"id":"resource-muv6sjlf","name":"异国日记","url":"","type":"movie_series","language":"日本語","topic":"","description":"忘了","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:01.107Z","updated_at":"2026-10-05T11:49:01.158Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6t02m',136,0,
        '9fd2d70aa9c8f4bb5593f62c832f7a25a13e851427407d50f7860313e0a67a1e',1,
        204,0,'0952e5b8609ce8f1f2f5e590165db48a4c74072db44ad99bf7e8713ba4d54455',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6t02m','source',0,'{"id":"resource-muv6t02m","name":"最后的维京人","url":"","type":"movie_series","language":"不限语言","topic":"","description":"麦子演傻子不像演的","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:22.462Z","updated_at":"2026-10-05T11:49:22.519Z","language_id":null}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6t02m','target',0,'{"id":"resource-muv6t02m","name":"最后的维京人","url":"","type":"movie_series","language":"不限语言","topic":"","description":"麦子演傻子不像演的","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:22.462Z","updated_at":"2026-10-05T11:49:22.519Z","language_id":null,"tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6trv2',137,0,
        '199841f55e8757e6070a848d2d0b43ad1a249ebd0a87688c51f22f31b5c75ed9',1,
        205,0,'40f55603b9a00f803983590728662d768a9038d3d05b6aad05c09f82843bde56',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6trv2','source',0,'{"id":"resource-muv6trv2","name":"小本经营金与银","url":"","type":"movie_series","language":"日本語","topic":"","description":"忘了 女主好像是请和我老公结婚","emoji":"","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:58.478Z","updated_at":"2026-10-05T11:49:58.571Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6trv2','target',0,'{"id":"resource-muv6trv2","name":"小本经营金与银","url":"","type":"movie_series","language":"日本語","topic":"","description":"忘了 女主好像是请和我老公结婚","emoji":"","status":"backlog","completed_at":"","created_at":"2026-10-05T11:49:58.478Z","updated_at":"2026-10-05T11:49:58.571Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6u93g',138,0,
        '29a1d34e15a03a7e2ad875ee1a506a52e5bea1f89d013ed1f08cc3380131c43e',1,
        206,0,'0419f9a897b52dba6c2faf5be9b9f61df283883ae1edf3900f8020fda0659a94',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6u93g','source',0,'{"id":"resource-muv6u93g","name":"雾蓝色的雨后晴天","url":"","type":"movie_series","language":"日本語","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:50:20.812Z","updated_at":"2026-10-05T11:50:20.839Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6u93g','target',0,'{"id":"resource-muv6u93g","name":"雾蓝色的雨后晴天","url":"","type":"movie_series","language":"日本語","topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-05T11:50:20.812Z","updated_at":"2026-10-05T11:50:20.839Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muv6v3j9',139,0,
        '14e0498ef6eb7c2541a840a981f0d046001daab4594280729352783fb823fa6c',1,
        207,0,'b8fdd9347258fd46af83cd52a15be01ff46823bad7cc4f9245e555b80a931041',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6v3j9','source',0,'{"id":"resource-muv6v3j9","name":"廖兆阳新日语班","url":"","type":"course","language":"日本語","topic":"","description":"好像很牛","emoji":"","status":"backlog","completed_at":"","created_at":"2026-10-05T11:51:00.261Z","updated_at":"2026-10-05T11:51:00.349Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muv6v3j9','target',0,'{"id":"resource-muv6v3j9","name":"廖兆阳新日语班","url":"","type":"course","language":"日本語","topic":"","description":"好像很牛","emoji":"","status":"backlog","completed_at":"","created_at":"2026-10-05T11:51:00.261Z","updated_at":"2026-10-05T11:51:00.349Z","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-muwr3ccr',140,0,
        '23c51adc6401b450f27dab637c12bb99fa9260331548192cb6ef015628788b09',1,
        208,0,'61e78fefd39d542448f34dffdb801cd57f0e67f81a7ba21404eb1443c4ef6d25',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muwr3ccr','source',0,'{"id":"resource-muwr3ccr","name":"Douglas is cancelled","url":"","type":"movie_series","language":"English","topic":"","description":"道格拉斯被取消了","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-06T14:05:03.435Z","updated_at":"2026-10-06T14:05:03.722Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06"}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-muwr3ccr','target',0,'{"id":"resource-muwr3ccr","name":"Douglas is cancelled","url":"","type":"movie_series","language":"English","topic":"","description":"道格拉斯被取消了","emoji":"🎬","status":"backlog","completed_at":"","created_at":"2026-10-06T14:05:03.435Z","updated_at":"2026-10-06T14:05:03.722Z","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","tag_ids":[],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'resource','resource-mux0thb9',144,0,
        'ac3ed1f26454d400c84a547cebbc3284f590760f5b8e1734bb70356950764464',1,
        209,0,'26c78e86faa1dd5c5f4cff47914c731463e53ff75826edd4710ba1de4c9b6b34',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mux0thb9','source',0,'{"id":"resource-mux0thb9","created_at":"2026-10-06T18:37:19.461Z","updated_at":"2026-10-14T10:48:26.790Z","name":"姚同学探家居","url":"","topic":"","description":"佛山家具一条龙","emoji":"🏠","type":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":null,"language":"不限语言","status":"backlog","completed_at":""}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'resource','resource-mux0thb9','target',0,'{"id":"resource-mux0thb9","created_at":"2026-10-06T18:37:19.461Z","updated_at":"2026-10-14T10:48:26.790Z","name":"姚同学探家居","url":"","topic":"","description":"佛山家具一条龙","emoji":"🏠","type":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":null,"language":"不限语言","status":"backlog","completed_at":"","tag_ids":["tag_migrated_8a88fbb234ec0452991a7127"],"deck_ids":[]}');

INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (1,'settings','resources',167,0,
        '27cfcbec7b36b686d3a102cd7cfde1dffc19b033b6124f3abd2f33323a8b1746',1,
        170,0,'952452818a336c8121d70888b49c6113c169dfe9b478065df5dabaf047593e0c',1);

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'settings','resources','source',0,'{"id":"resources","languages":[{"id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","name":"中文"},{"id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","name":"English"},{"id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","name":"日本語"},{"id":"lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0","name":"Nederlands"}],"groups":[{"id":"work","name":"工作"},{"id":"study","name":"学习"},{"id":"personal","name":"生活"},{"id":"eada7e3f-97f8-491c-92de-140f041ed015","name":"看点男同文"}],"types":[{"id":"project","name":"项目资料","group":"work"},{"id":"course","name":"课程","group":"study"},{"id":"website","name":"学习网站","group":"study"},{"id":"movie_series","name":"电影 / 剧集","group":"personal"},{"id":"book","name":"书籍","group":"personal"},{"id":"variety","name":"综艺","group":"personal"},{"id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","name":"magpie","group":"personal"},{"id":"c4cfcc3a-5f2a-4482-a938-0e2691439706","name":"五夏","group":"eada7e3f-97f8-491c-92de-140f041ed015"}]}');

INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (1,'settings','resources','target',0,'{"id":"resources","languages":[{"id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","name":"中文"},{"id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","name":"English"},{"id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","name":"日本語"},{"id":"lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0","name":"Nederlands"}],"groups":[{"id":"work","name":"工作"},{"id":"study","name":"学习"},{"id":"personal","name":"生活"},{"id":"eada7e3f-97f8-491c-92de-140f041ed015","name":"看点男同文"}],"types":[{"id":"project","name":"项目资料","emoji":"📁","group":"work"},{"id":"course","name":"课程","emoji":"🎓","group":"study"},{"id":"website","name":"网站 / 工具","emoji":"🌐","group":"study"},{"id":"movie_series","name":"影视","emoji":"🎬","group":"personal"},{"id":"book","name":"书籍","emoji":"📚","group":"personal"},{"id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","name":"magpie","emoji":"","group":"personal"},{"id":"c4cfcc3a-5f2a-4482-a938-0e2691439706","name":"五夏","emoji":"","group":"eada7e3f-97f8-491c-92de-140f041ed015"},{"id":"article","name":"文章","emoji":"📝"},{"id":"audio","name":"音频","emoji":"🎧"},{"id":"game","name":"游戏","emoji":"🎮"},{"id":"other","name":"其他","emoji":"📌"}],"schema_version":4,"tags":[{"id":"tag_migrated_8a88fbb234ec0452991a7127","name":"magpie","emoji":"🏷️"},{"id":"tag_migrated_865ba65319c0ba3af3473beb","name":"五夏","emoji":"🏷️"}],"decks":[]}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'language','lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21','','{"name":"中文","normalized_name":"中文","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'language','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','{"name":"日本語","normalized_name":"日本語","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'language','lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0','','{"name":"Nederlands","normalized_name":"nederlands","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'language','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','{"name":"English","normalized_name":"english","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_group','eada7e3f-97f8-491c-92de-140f041ed015','','{"name":"看点男同文","source_json":"{\"id\":\"eada7e3f-97f8-491c-92de-140f041ed015\",\"name\":\"看点男同文\"}","active":1,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z"}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_group','personal','','{"name":"生活","source_json":"{\"id\":\"personal\",\"name\":\"生活\"}","active":1,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z"}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_group','study','','{"name":"学习","source_json":"{\"id\":\"study\",\"name\":\"学习\"}","active":1,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z"}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_group','work','','{"name":"工作","source_json":"{\"id\":\"work\",\"name\":\"工作\"}","active":1,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z"}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','3fd6419d-70b6-4798-9ff1-1fa794be27a9','personal','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','book','personal','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','c4cfcc3a-5f2a-4482-a938-0e2691439706','eada7e3f-97f8-491c-92de-140f041ed015','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','course','study','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','movie_series','personal','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','project','work','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'legacy_type_group','website','study','{}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','0c61e75a-d4d0-4ca6-879c-02036f7a9a61','','{"name":"火锅森","url":"","type_id":"project","language_id":null,"legacy_language":"","legacy_topic":"","description":"14 【北美公司面试！薪资低于预期怎么回答💸 - 火锅森 | 小红书 - 你的生活兴趣社区】 😆 KxhuOjLskgXwy4r 😆 https://www.xiaohongshu.com/discovery/item/69d7cb43000000002102d103?source=webshare&xhsshare=pc_web&xsec_token=ABaaILZXLe9V8DqPG60nxxFM4LTukr9zwHsG9I8ry3en4=&xsec_source=pc_share","emoji":"","status":"backlog","completed_at":"","revision":171,"created_at":"2026-11-17T21:42:02.273Z","updated_at":"2026-11-17T21:42:02.273Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','291f5066-956c-4811-9580-052bb98af607','','{"name":"和田雅成　わだまさなり","url":"","type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"和田雅成 入坑小指南（更新至舞台剧） 欢迎大家捉虫/... \nhttps://xhslink.cn/o/96Jk5WIaaZX\n\n要饭吃 https://xhslink.cn/o/7hg8vmwY1p9","emoji":"🇯🇵","status":"backlog","completed_at":"","revision":172,"created_at":"2026-11-18T09:30:23.588Z","updated_at":"2026-11-18T09:31:34.047Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','429c1f22-2c74-4db0-9ae6-a10e4809554b','','{"name":"杀死你的旅途","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"gay！黑道给！","emoji":"🎬","status":"completed","completed_at":"2026-11-18T09:40:15.799Z","revision":173,"created_at":"2026-11-15T20:07:45.082Z","updated_at":"2026-11-18T09:40:16.333Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','4bb69c1b-8294-4255-91fc-e35cf36ff309','','{"name":"小妈abo","url":"https://xhslink.cn/o/7ozeZ5ps1kr","type_id":"c4cfcc3a-5f2a-4482-a938-0e2691439706","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","legacy_language":"","legacy_topic":"","description":"五夏——小妈(二) 哦哦哦在@人生难得我乐意 的催更下 ... https://xhslink.cn/o/7ozeZ5ps1kr","emoji":"","status":"backlog","completed_at":"","revision":174,"created_at":"2026-11-18T09:42:06.322Z","updated_at":"2026-11-18T09:42:06.322Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','50995e32-4708-48a8-b20c-8a30d3573ab7','','{"name":"新闻编辑室","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"牛逼就完了\nOnly doctor can say she''s dead.","emoji":"🎬","status":"backlog","completed_at":"","revision":175,"created_at":"2026-11-18T09:27:43.787Z","updated_at":"2026-11-18T09:27:43.787Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','69dfa2b7-690f-4e34-86fe-259cbebbc8cf','','{"name":"职业天赋分析","url":"https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share","type_id":"project","language_id":null,"legacy_language":"","legacy_topic":"","description":"59 【看了这个姐妹的分享我去找了ds老师 - 欧阳牛牛oynn | 小红书 - 你的生活兴趣社区】 😆 eRBWJiGB7bBk4Nq 😆 https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share\n\n79 【这个prompt可以帮你找到你以前不知道自己能 - 芥末AI日记 | 小红书 - 你的生活兴趣社区】 😆 4gvC2lD0l1m1ky9 😆 https://www.xiaohongshu.com/discovery/item/69c66f3f000000001a02db60?source=webshare&xhsshare=pc_web&xsec_token=ABvKS_YGA7eIR8Xk727x-eFHg2zEJCjiOoLw3peV8fO2U=&xsec_source=","emoji":"","status":"backlog","completed_at":"","revision":176,"created_at":"2026-11-17T21:25:30.728Z","updated_at":"2026-11-17T21:42:29.036Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','c96d7782-a18a-4708-87bd-b69caa85cc41','','{"name":"由你主动吻我吧","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"日腐 给！","emoji":"🇯🇵","status":"backlog","completed_at":"","revision":177,"created_at":"2026-11-18T09:32:40.964Z","updated_at":"2026-11-18T09:32:40.964Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtqb4n6a','','{"name":"JLPT刷题","url":"https://dethitiengnhat.com/en","type_id":"website","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"日语学习","description":"刷题网站","emoji":"🇯🇵","status":"backlog","completed_at":"","revision":178,"created_at":"2026-09-06T21:11:50.866Z","updated_at":"2026-09-20T19:52:50.865Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtqb76vn','','{"name":"待命警察 On Call","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"美剧","description":"俩警察在加油站看到一个爹和妈吵架后来爹自焚了\n好看！节奏紧凑！喜欢喜欢！","emoji":"","status":"completed","completed_at":"2026-09-29T09:43:01.993Z","revision":179,"created_at":"2026-09-06T21:13:49.715Z","updated_at":"2026-09-29T09:43:02.114Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtqb83z0','','{"name":"Tsunahiro","url":"https://tsunagarujp.mext.go.jp/?lang_id=EN","type_id":"website","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"日语学习","description":"Website for Foreign Nationals as Residents to Learn Japanese Language\nConnect and Enhance Your Life in Japanese","emoji":"🇯🇵","status":"backlog","completed_at":"","revision":180,"created_at":"2026-09-06T21:14:32.604Z","updated_at":"2026-09-20T19:52:50.755Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtqb8xwe','','{"name":"Lingohut","url":"https://www.lingohut.com/zh","type_id":"website","language_id":null,"legacy_language":"","legacy_topic":"","description":"啥语言都能学，是兄弟就来学外语","emoji":"🏳️‍🌈","status":"backlog","completed_at":"","revision":181,"created_at":"2026-09-06T21:15:11.390Z","updated_at":"2026-09-20T19:52:50.706Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtqba60k','','{"name":"NT2 TaalMenu","url":"https://nt2taalmenu.nl/","type_id":"website","language_id":"lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0","legacy_language":"","legacy_topic":"荷兰语学习","description":"刷题用","emoji":"🇳🇱","status":"backlog","completed_at":"","revision":182,"created_at":"2026-09-06T21:16:08.564Z","updated_at":"2026-09-20T19:52:50.652Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyuail8','','{"name":"如果回到结婚前","url":"","type_id":"book","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","legacy_language":"","legacy_topic":"","description":"温柔占有欲年下1x直球美人0 卧槽啊 给！！","emoji":"📖","status":"backlog","completed_at":"","revision":183,"created_at":"2026-09-12T20:30:26.972Z","updated_at":"2026-09-20T19:52:50.601Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyujgtr','','{"name":"可能的爱情","url":"","type_id":"movie_series","language_id":null,"legacy_language":"","legacy_topic":"","description":"超牛逼\n无敌好看，羡慕还没看过的眼睛，还能够一无所知地走进电影院被从头到尾震撼一次，见证一次神降临的瞬间","emoji":"🎬","status":"backlog","completed_at":"","revision":184,"created_at":"2026-09-12T20:37:24.591Z","updated_at":"2026-09-20T19:52:50.540Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyuowjn','','{"name":"The Marvelous Mrs. Maisel 了不起的麦瑟尔夫人","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"一个能忘面试的人，和一个能等面试7小时的人","emoji":"🎬","status":"backlog","completed_at":"","revision":185,"created_at":"2026-09-12T20:41:38.243Z","updated_at":"2026-09-20T19:52:50.483Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyuqw2p','','{"name":"25时赤坂见","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"给","emoji":"🎬","status":"backlog","completed_at":"","revision":186,"created_at":"2026-09-12T20:43:10.945Z","updated_at":"2026-09-20T19:52:50.431Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyuuy8y','','{"name":"the big short 大空头","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"This is my quant! My quantitive!","emoji":"🎬","status":"backlog","completed_at":"","revision":187,"created_at":"2026-09-12T20:46:20.386Z","updated_at":"2026-09-20T19:52:50.375Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyv3sx5','','{"name":"波士顿法律","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"间歇性精神障碍杀人辩护","emoji":"🎬","status":"backlog","completed_at":"","revision":188,"created_at":"2026-09-12T20:53:13.385Z","updated_at":"2026-09-20T19:52:50.327Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyv8pml','','{"name":"Hacks 绝望写手","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"每周女巫审判现场为您报道","emoji":"🎬","status":"backlog","completed_at":"","revision":189,"created_at":"2026-09-12T20:57:02.397Z","updated_at":"2026-09-20T19:52:50.272Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyvh5eq','','{"name":"good luck 空中情缘","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"木村拓哉当机长","emoji":"🎬","status":"backlog","completed_at":"","revision":190,"created_at":"2026-09-12T21:03:36.098Z","updated_at":"2026-09-20T19:52:50.212Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyvmrz3','','{"name":"The good wife 傲骨贤妻","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"发疯男人最好命，will再次庭前开炮","emoji":"🎬","status":"backlog","completed_at":"","revision":191,"created_at":"2026-09-12T21:07:58.623Z","updated_at":"2026-09-20T19:52:50.152Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtywan60','','{"name":"The illusion of choice","url":"","type_id":"book","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"自己的消费决定究竟有多少是真的“自己选的”","emoji":"📖","status":"backlog","completed_at":"","revision":192,"created_at":"2026-09-12T21:26:32.136Z","updated_at":"2026-10-06T18:40:36.917Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtywdyow','','{"name":"Orientalism - Edward W.Said","url":"","type_id":"book","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"一个国家、一种文化的方式，也可能早已被某种叙事塑造。","emoji":"📖","status":"backlog","completed_at":"","revision":193,"created_at":"2026-09-12T21:29:07.040Z","updated_at":"2026-10-06T18:41:28.357Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtywhz2r','','{"name":"同志亦凡人","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"给！","emoji":"🎬","status":"backlog","completed_at":"","revision":194,"created_at":"2026-09-12T21:32:14.163Z","updated_at":"2026-09-20T19:52:49.957Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyycr8l','','{"name":"FT News Briefing","url":"","type_id":"project","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"英语听力","description":"时间短 15分钟帮你快速了解全球最重要的商业政治和经济新闻","emoji":"🎧","status":"backlog","completed_at":"","revision":195,"created_at":"2026-09-12T22:24:09.957Z","updated_at":"2026-10-06T18:41:56.274Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mtyyn7to','','{"name":"Easy-Vibe","url":"https://github.com/THU-SIGS-AIID/ai-vibe-coding-101","type_id":"website","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"study for work","description":"零基础即可入门的 AI 原生应用实践教程。","emoji":"💻","status":"backlog","completed_at":"","revision":196,"created_at":"2026-09-12T22:32:18.012Z","updated_at":"2026-10-14T10:48:44.558Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mu1sjplw','','{"name":"记忆管理局","url":"","type_id":"movie_series","language_id":"lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21","legacy_language":"","legacy_topic":"","description":"好像说 像被锤了一拳一样好看\n--- 我看完了 我好懵 我真的懂了吗？","emoji":"🎬","status":"completed","completed_at":"2026-09-20T20:05:56.178Z","revision":197,"created_at":"2026-09-14T22:04:55.268Z","updated_at":"2026-09-20T20:06:13.309Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mu1sncji','','{"name":"可能的爱情","url":"","type_id":"movie_series","language_id":null,"legacy_language":"","legacy_topic":"","description":"超牛逼高分神作 等上线","emoji":"🎬","status":"backlog","completed_at":"","revision":198,"created_at":"2026-09-14T22:07:44.958Z","updated_at":"2026-09-20T19:52:49.668Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mu1sowj8','','{"name":"降临","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"不看不是ling人\n不好看，神神叨叨的","emoji":"🎬","status":"completed","completed_at":"2026-09-29T09:45:45.404Z","revision":199,"created_at":"2026-09-14T22:08:57.524Z","updated_at":"2026-09-29T09:45:45.425Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mucg2pwk','','{"name":"Twin Peaks","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"不知道是啥 上课的时候from Lucy","emoji":"🎬","status":"backlog","completed_at":"","revision":200,"created_at":"2026-09-22T09:01:15.044Z","updated_at":"2026-09-22T09:01:35.167Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6rlhl','','{"name":"邪恶力量","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","revision":201,"created_at":"2026-10-05T11:48:16.905Z","updated_at":"2026-10-05T11:48:17.107Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6rz7b','','{"name":"焦土之城","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","revision":202,"created_at":"2026-10-05T11:48:34.679Z","updated_at":"2026-10-05T11:48:34.742Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6sjlf','','{"name":"异国日记","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"忘了","emoji":"🎬","status":"backlog","completed_at":"","revision":203,"created_at":"2026-10-05T11:49:01.107Z","updated_at":"2026-10-05T11:49:01.158Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6t02m','','{"name":"最后的维京人","url":"","type_id":"movie_series","language_id":null,"legacy_language":"","legacy_topic":"","description":"麦子演傻子不像演的","emoji":"🎬","status":"backlog","completed_at":"","revision":204,"created_at":"2026-10-05T11:49:22.462Z","updated_at":"2026-10-05T11:49:22.519Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6trv2','','{"name":"小本经营金与银","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"忘了 女主好像是请和我老公结婚","emoji":"","status":"backlog","completed_at":"","revision":205,"created_at":"2026-10-05T11:49:58.478Z","updated_at":"2026-10-05T11:49:58.571Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6u93g','','{"name":"雾蓝色的雨后晴天","url":"","type_id":"movie_series","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"","emoji":"🎬","status":"backlog","completed_at":"","revision":206,"created_at":"2026-10-05T11:50:20.812Z","updated_at":"2026-10-05T11:50:20.839Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muv6v3j9','','{"name":"廖兆阳新日语班","url":"","type_id":"course","language_id":"lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5","legacy_language":"","legacy_topic":"","description":"好像很牛","emoji":"","status":"backlog","completed_at":"","revision":207,"created_at":"2026-10-05T11:51:00.261Z","updated_at":"2026-10-05T11:51:00.349Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-muwr3ccr','','{"name":"Douglas is cancelled","url":"","type_id":"movie_series","language_id":"lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06","legacy_language":"","legacy_topic":"","description":"道格拉斯被取消了","emoji":"🎬","status":"backlog","completed_at":"","revision":208,"created_at":"2026-10-06T14:05:03.435Z","updated_at":"2026-10-06T14:05:03.722Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource','resource-mux0thb9','','{"name":"姚同学探家居","url":"","type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","language_id":null,"legacy_language":"","legacy_topic":"","description":"佛山家具一条龙","emoji":"🏠","status":"backlog","completed_at":"","revision":209,"created_at":"2026-10-06T18:37:19.461Z","updated_at":"2026-10-14T10:48:26.790Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource_tag','291f5066-956c-4811-9580-052bb98af607','tag_migrated_8a88fbb234ec0452991a7127','{"revision":172,"created_at":"2026-11-18T09:30:23.588Z","updated_at":"2026-11-18T09:31:34.047Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource_tag','4bb69c1b-8294-4255-91fc-e35cf36ff309','tag_migrated_865ba65319c0ba3af3473beb','{"revision":174,"created_at":"2026-11-18T09:42:06.322Z","updated_at":"2026-11-18T09:42:06.322Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'resource_tag','resource-mux0thb9','tag_migrated_8a88fbb234ec0452991a7127','{"revision":209,"created_at":"2026-10-06T18:37:19.461Z","updated_at":"2026-10-14T10:48:26.790Z","deleted_at":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'tag','tag_migrated_865ba65319c0ba3af3473beb','','{"name":"五夏","normalized_name":"五夏","emoji":"🏷️","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'tag','tag_migrated_8a88fbb234ec0452991a7127','','{"name":"magpie","normalized_name":"magpie","emoji":"🏷️","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','3fd6419d-70b6-4798-9ff1-1fa794be27a9','','{"name":"magpie","normalized_name":"magpie","emoji":"","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','article','','{"name":"文章","normalized_name":"文章","emoji":"📝","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','audio','','{"name":"音频","normalized_name":"音频","emoji":"🎧","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','book','','{"name":"书籍","normalized_name":"书籍","emoji":"📚","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','c4cfcc3a-5f2a-4482-a938-0e2691439706','','{"name":"五夏","normalized_name":"五夏","emoji":"","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','course','','{"name":"课程","normalized_name":"课程","emoji":"🎓","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','game','','{"name":"游戏","normalized_name":"游戏","emoji":"🎮","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','movie_series','','{"name":"影视","normalized_name":"影视","emoji":"🎬","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','other','','{"name":"其他","normalized_name":"其他","emoji":"📌","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','project','','{"name":"项目资料","normalized_name":"项目资料","emoji":"📁","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (1,'type','website','','{"name":"网站 / 工具","normalized_name":"网站 / 工具","emoji":"🌐","revision":170,"created_at":"2026-11-23T10:18:27.912Z","updated_at":"2026-11-23T10:18:27.912Z","deleted_at":null,"merged_into_id":null}');

INSERT INTO collection_migration_guards (migration_version,valid)
    VALUES (1,CASE WHEN
      1=1 AND EXISTS (
        SELECT 1 FROM app_schema_migrations
        WHERE version=1 AND checksum='9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4'
      ) AND ((EXISTS (
        SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423' AND head=169
      ) AND NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    WHERE expected.migration_version=1 AND (
      expected.source_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source') OR
      expected.source_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source'),0) OR
      expected.target_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target') OR
      expected.target_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target'),0)
    )
  )
      AND (SELECT COUNT(*) FROM collection_migration_source_objects
        WHERE migration_version=1) = (
          SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
        ) AND NOT EXISTS (
          SELECT 1 FROM collection_migration_source_objects AS expected
          LEFT JOIN sync_v2_objects AS actual
            ON actual.entity=expected.entity AND actual.id=expected.id
          WHERE expected.migration_version=1 AND (
            actual.entity IS NULL OR actual.revision<>expected.revision OR
            actual.deleted<>expected.deleted OR actual.data IS NOT (SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks AS payload_chunks
    WHERE payload_chunks.migration_version=expected.migration_version
      AND payload_chunks.entity=expected.entity
      AND payload_chunks.id=expected.id
      AND payload_chunks.payload='source'
    ORDER BY payload_chunks.chunk_index
  ))
          )
        )) OR (EXISTS (
        SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423' AND head=209
      ) AND NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    WHERE expected.migration_version=1 AND (
      expected.source_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source') OR
      expected.source_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source'),0) OR
      expected.target_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target') OR
      expected.target_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target'),0)
    )
  )
      AND (SELECT COUNT(*) FROM collection_migration_source_objects
        WHERE migration_version=1) = (
          SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
        ) AND NOT EXISTS (
          SELECT 1 FROM collection_migration_source_objects AS expected
          LEFT JOIN sync_v2_objects AS actual
            ON actual.entity=expected.entity AND actual.id=expected.id
          WHERE expected.migration_version=1 AND (
            actual.entity IS NULL OR actual.revision<>expected.target_revision OR
            actual.deleted<>expected.target_deleted OR actual.data IS NOT (SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks AS payload_chunks
    WHERE payload_chunks.migration_version=expected.migration_version
      AND payload_chunks.entity=expected.entity
      AND payload_chunks.id=expected.id
      AND payload_chunks.payload='target'
    ORDER BY payload_chunks.chunk_index
  ))
          )
        )))
      THEN 1 ELSE 0 END)
    ON CONFLICT(migration_version) DO UPDATE SET valid=excluded.valid;

INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (1,'warning','resource_taxonomy_review_required','resource','291f5066-956c-4811-9580-052bb98af607','{"source_type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","preserved_type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","added_tag":"magpie"}');

INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (1,'warning','resource_taxonomy_review_required','resource','4bb69c1b-8294-4255-91fc-e35cf36ff309','{"source_type_id":"c4cfcc3a-5f2a-4482-a938-0e2691439706","preserved_type_id":"c4cfcc3a-5f2a-4482-a938-0e2691439706","added_tag":"五夏"}');

INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (1,'warning','resource_taxonomy_review_required','resource','resource-mux0thb9','{"source_type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","preserved_type_id":"3fd6419d-70b6-4798-9ff1-1fa794be27a9","added_tag":"magpie"}');

INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (1,'warning','taxonomy_review_required','type','3fd6419d-70b6-4798-9ff1-1fa794be27a9','{"name":"magpie","action":"preserved_with_exact_name_tag"}');

INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (1,'warning','taxonomy_review_required','type','c4cfcc3a-5f2a-4482-a938-0e2691439706','{"name":"五夏","action":"preserved_with_exact_name_tag"}');

INSERT INTO collection_languages (id,name,normalized_name,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21','中文','中文',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_languages.revision < excluded.revision;

INSERT INTO collection_languages (id,name,normalized_name,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','English','english',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_languages.revision < excluded.revision;

INSERT INTO collection_languages (id,name,normalized_name,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','日本語','日本語',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_languages.revision < excluded.revision;

INSERT INTO collection_languages (id,name,normalized_name,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0','Nederlands','nederlands',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_languages.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('project','项目资料','项目资料','📁',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('course','课程','课程','🎓',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('website','网站 / 工具','网站 / 工具','🌐',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('movie_series','影视','影视','🎬',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('book','书籍','书籍','📚',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('3fd6419d-70b6-4798-9ff1-1fa794be27a9','magpie','magpie','',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('c4cfcc3a-5f2a-4482-a938-0e2691439706','五夏','五夏','',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('article','文章','文章','📝',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('audio','音频','音频','🎧',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('game','游戏','游戏','🎮',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_types (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('other','其他','其他','📌',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_types.revision < excluded.revision;

INSERT INTO collection_tags (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('tag_migrated_8a88fbb234ec0452991a7127','magpie','magpie','🏷️',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_tags.revision < excluded.revision;

INSERT INTO collection_tags (id,name,normalized_name,emoji,revision,created_at,updated_at,deleted_at,merged_into_id) VALUES ('tag_migrated_865ba65319c0ba3af3473beb','五夏','五夏','🏷️',170,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z',NULL,NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,updated_at=excluded.updated_at,revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE collection_tags.revision < excluded.revision;

INSERT INTO collection_legacy_groups
      (id,name,source_json,active,created_at,updated_at)
      VALUES ('work','工作','{"id":"work","name":"工作"}',1,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z')
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at;

INSERT INTO collection_legacy_groups
      (id,name,source_json,active,created_at,updated_at)
      VALUES ('study','学习','{"id":"study","name":"学习"}',1,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z')
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at;

INSERT INTO collection_legacy_groups
      (id,name,source_json,active,created_at,updated_at)
      VALUES ('personal','生活','{"id":"personal","name":"生活"}',1,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z')
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at;

INSERT INTO collection_legacy_groups
      (id,name,source_json,active,created_at,updated_at)
      VALUES ('eada7e3f-97f8-491c-92de-140f041ed015','看点男同文','{"id":"eada7e3f-97f8-491c-92de-140f041ed015","name":"看点男同文"}',1,'2026-11-23T10:18:27.912Z','2026-11-23T10:18:27.912Z')
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at;

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('project','work');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('course','study');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('website','study');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('movie_series','personal');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('book','personal');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('3fd6419d-70b6-4798-9ff1-1fa794be27a9','personal');

INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES ('c4cfcc3a-5f2a-4482-a938-0e2691439706','eada7e3f-97f8-491c-92de-140f041ed015');

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('0c61e75a-d4d0-4ca6-879c-02036f7a9a61','火锅森','','project',NULL,'','','14 【北美公司面试！薪资低于预期怎么回答💸 - 火锅森 | 小红书 - 你的生活兴趣社区】 😆 KxhuOjLskgXwy4r 😆 https://www.xiaohongshu.com/discovery/item/69d7cb43000000002102d103?source=webshare&xhsshare=pc_web&xsec_token=ABaaILZXLe9V8DqPG60nxxFM4LTukr9zwHsG9I8ry3en4=&xsec_source=pc_share','','backlog','',171,'2026-11-17T21:42:02.273Z','2026-11-17T21:42:02.273Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('291f5066-956c-4811-9580-052bb98af607','和田雅成　わだまさなり','','3fd6419d-70b6-4798-9ff1-1fa794be27a9','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','和田雅成 入坑小指南（更新至舞台剧） 欢迎大家捉虫/... 
https://xhslink.cn/o/96Jk5WIaaZX

要饭吃 https://xhslink.cn/o/7hg8vmwY1p9','🇯🇵','backlog','',172,'2026-11-18T09:30:23.588Z','2026-11-18T09:31:34.047Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resource_tags
        (resource_id,tag_id,revision,created_at,updated_at,deleted_at)
        VALUES ('291f5066-956c-4811-9580-052bb98af607','tag_migrated_8a88fbb234ec0452991a7127',172,'2026-11-18T09:30:23.588Z','2026-11-18T09:31:34.047Z',NULL)
        ON CONFLICT(resource_id,tag_id) DO UPDATE SET
          revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL
        WHERE collection_resource_tags.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('429c1f22-2c74-4db0-9ae6-a10e4809554b','杀死你的旅途','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','gay！黑道给！','🎬','completed','2026-11-18T09:40:15.799Z',173,'2026-11-15T20:07:45.082Z','2026-11-18T09:40:16.333Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('4bb69c1b-8294-4255-91fc-e35cf36ff309','小妈abo','https://xhslink.cn/o/7ozeZ5ps1kr','c4cfcc3a-5f2a-4482-a938-0e2691439706','lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21','','','五夏——小妈(二) 哦哦哦在@人生难得我乐意 的催更下 ... https://xhslink.cn/o/7ozeZ5ps1kr','','backlog','',174,'2026-11-18T09:42:06.322Z','2026-11-18T09:42:06.322Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resource_tags
        (resource_id,tag_id,revision,created_at,updated_at,deleted_at)
        VALUES ('4bb69c1b-8294-4255-91fc-e35cf36ff309','tag_migrated_865ba65319c0ba3af3473beb',174,'2026-11-18T09:42:06.322Z','2026-11-18T09:42:06.322Z',NULL)
        ON CONFLICT(resource_id,tag_id) DO UPDATE SET
          revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL
        WHERE collection_resource_tags.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('50995e32-4708-48a8-b20c-8a30d3573ab7','新闻编辑室','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','牛逼就完了
Only doctor can say she''s dead.','🎬','backlog','',175,'2026-11-18T09:27:43.787Z','2026-11-18T09:27:43.787Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('69dfa2b7-690f-4e34-86fe-259cbebbc8cf','职业天赋分析','https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share','project',NULL,'','','59 【看了这个姐妹的分享我去找了ds老师 - 欧阳牛牛oynn | 小红书 - 你的生活兴趣社区】 😆 eRBWJiGB7bBk4Nq 😆 https://www.xiaohongshu.com/discovery/item/69e21b6a000000001a0330f2?source=webshare&xhsshare=pc_web&xsec_token=ABrv5dcwIya1ZwhKHRc5ciXeUNbGUriQto1Kj4ywG6Z8c=&xsec_source=pc_share

79 【这个prompt可以帮你找到你以前不知道自己能 - 芥末AI日记 | 小红书 - 你的生活兴趣社区】 😆 4gvC2lD0l1m1ky9 😆 https://www.xiaohongshu.com/discovery/item/69c66f3f000000001a02db60?source=webshare&xhsshare=pc_web&xsec_token=ABvKS_YGA7eIR8Xk727x-eFHg2zEJCjiOoLw3peV8fO2U=&xsec_source=','','backlog','',176,'2026-11-17T21:25:30.728Z','2026-11-17T21:42:29.036Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('c96d7782-a18a-4708-87bd-b69caa85cc41','由你主动吻我吧','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','日腐 给！','🇯🇵','backlog','',177,'2026-11-18T09:32:40.964Z','2026-11-18T09:32:40.964Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtqb4n6a','JLPT刷题','https://dethitiengnhat.com/en','website','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','日语学习','刷题网站','🇯🇵','backlog','',178,'2026-09-06T21:11:50.866Z','2026-09-20T19:52:50.865Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtqb76vn','待命警察 On Call','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','美剧','俩警察在加油站看到一个爹和妈吵架后来爹自焚了
好看！节奏紧凑！喜欢喜欢！','','completed','2026-09-29T09:43:01.993Z',179,'2026-09-06T21:13:49.715Z','2026-09-29T09:43:02.114Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtqb83z0','Tsunahiro','https://tsunagarujp.mext.go.jp/?lang_id=EN','website','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','日语学习','Website for Foreign Nationals as Residents to Learn Japanese Language
Connect and Enhance Your Life in Japanese','🇯🇵','backlog','',180,'2026-09-06T21:14:32.604Z','2026-09-20T19:52:50.755Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtqb8xwe','Lingohut','https://www.lingohut.com/zh','website',NULL,'','','啥语言都能学，是兄弟就来学外语','🏳️‍🌈','backlog','',181,'2026-09-06T21:15:11.390Z','2026-09-20T19:52:50.706Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtqba60k','NT2 TaalMenu','https://nt2taalmenu.nl/','website','lang_8d5ee19ed855367529ebf96c02ae8b8bbf9bc77039c0f32a5cc6d4a0a9404ec0','','荷兰语学习','刷题用','🇳🇱','backlog','',182,'2026-09-06T21:16:08.564Z','2026-09-20T19:52:50.652Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyuail8','如果回到结婚前','','book','lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21','','','温柔占有欲年下1x直球美人0 卧槽啊 给！！','📖','backlog','',183,'2026-09-12T20:30:26.972Z','2026-09-20T19:52:50.601Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyujgtr','可能的爱情','','movie_series',NULL,'','','超牛逼
无敌好看，羡慕还没看过的眼睛，还能够一无所知地走进电影院被从头到尾震撼一次，见证一次神降临的瞬间','🎬','backlog','',184,'2026-09-12T20:37:24.591Z','2026-09-20T19:52:50.540Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyuowjn','The Marvelous Mrs. Maisel 了不起的麦瑟尔夫人','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','一个能忘面试的人，和一个能等面试7小时的人','🎬','backlog','',185,'2026-09-12T20:41:38.243Z','2026-09-20T19:52:50.483Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyuqw2p','25时赤坂见','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','给','🎬','backlog','',186,'2026-09-12T20:43:10.945Z','2026-09-20T19:52:50.431Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyuuy8y','the big short 大空头','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','This is my quant! My quantitive!','🎬','backlog','',187,'2026-09-12T20:46:20.386Z','2026-09-20T19:52:50.375Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyv3sx5','波士顿法律','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','间歇性精神障碍杀人辩护','🎬','backlog','',188,'2026-09-12T20:53:13.385Z','2026-09-20T19:52:50.327Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyv8pml','Hacks 绝望写手','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','每周女巫审判现场为您报道','🎬','backlog','',189,'2026-09-12T20:57:02.397Z','2026-09-20T19:52:50.272Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyvh5eq','good luck 空中情缘','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','木村拓哉当机长','🎬','backlog','',190,'2026-09-12T21:03:36.098Z','2026-09-20T19:52:50.212Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyvmrz3','The good wife 傲骨贤妻','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','发疯男人最好命，will再次庭前开炮','🎬','backlog','',191,'2026-09-12T21:07:58.623Z','2026-09-20T19:52:50.152Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtywan60','The illusion of choice','','book','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','自己的消费决定究竟有多少是真的“自己选的”','📖','backlog','',192,'2026-09-12T21:26:32.136Z','2026-10-06T18:40:36.917Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtywdyow','Orientalism - Edward W.Said','','book','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','一个国家、一种文化的方式，也可能早已被某种叙事塑造。','📖','backlog','',193,'2026-09-12T21:29:07.040Z','2026-10-06T18:41:28.357Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtywhz2r','同志亦凡人','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','给！','🎬','backlog','',194,'2026-09-12T21:32:14.163Z','2026-09-20T19:52:49.957Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyycr8l','FT News Briefing','','project','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','英语听力','时间短 15分钟帮你快速了解全球最重要的商业政治和经济新闻','🎧','backlog','',195,'2026-09-12T22:24:09.957Z','2026-10-06T18:41:56.274Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mtyyn7to','Easy-Vibe','https://github.com/THU-SIGS-AIID/ai-vibe-coding-101','website','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','study for work','零基础即可入门的 AI 原生应用实践教程。','💻','backlog','',196,'2026-09-12T22:32:18.012Z','2026-10-14T10:48:44.558Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mu1sjplw','记忆管理局','','movie_series','lang_72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21','','','好像说 像被锤了一拳一样好看
--- 我看完了 我好懵 我真的懂了吗？','🎬','completed','2026-09-20T20:05:56.178Z',197,'2026-09-14T22:04:55.268Z','2026-09-20T20:06:13.309Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mu1sncji','可能的爱情','','movie_series',NULL,'','','超牛逼高分神作 等上线','🎬','backlog','',198,'2026-09-14T22:07:44.958Z','2026-09-20T19:52:49.668Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mu1sowj8','降临','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','不看不是ling人
不好看，神神叨叨的','🎬','completed','2026-09-29T09:45:45.404Z',199,'2026-09-14T22:08:57.524Z','2026-09-29T09:45:45.425Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mucg2pwk','Twin Peaks','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','不知道是啥 上课的时候from Lucy','🎬','backlog','',200,'2026-09-22T09:01:15.044Z','2026-09-22T09:01:35.167Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6rlhl','邪恶力量','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','','🎬','backlog','',201,'2026-10-05T11:48:16.905Z','2026-10-05T11:48:17.107Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6rz7b','焦土之城','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','','🎬','backlog','',202,'2026-10-05T11:48:34.679Z','2026-10-05T11:48:34.742Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6sjlf','异国日记','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','忘了','🎬','backlog','',203,'2026-10-05T11:49:01.107Z','2026-10-05T11:49:01.158Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6t02m','最后的维京人','','movie_series',NULL,'','','麦子演傻子不像演的','🎬','backlog','',204,'2026-10-05T11:49:22.462Z','2026-10-05T11:49:22.519Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6trv2','小本经营金与银','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','忘了 女主好像是请和我老公结婚','','backlog','',205,'2026-10-05T11:49:58.478Z','2026-10-05T11:49:58.571Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6u93g','雾蓝色的雨后晴天','','movie_series','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','','🎬','backlog','',206,'2026-10-05T11:50:20.812Z','2026-10-05T11:50:20.839Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muv6v3j9','廖兆阳新日语班','','course','lang_77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5','','','好像很牛','','backlog','',207,'2026-10-05T11:51:00.261Z','2026-10-05T11:51:00.349Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-muwr3ccr','Douglas is cancelled','','movie_series','lang_ba118bf7fc9c1aedc1edb28a0aa86e0b43b681f222af6616e13c43be87815b06','','','道格拉斯被取消了','🎬','backlog','',208,'2026-10-06T14:05:03.435Z','2026-10-06T14:05:03.722Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES ('resource-mux0thb9','姚同学探家居','','3fd6419d-70b6-4798-9ff1-1fa794be27a9',NULL,'','','佛山家具一条龙','🏠','backlog','',209,'2026-10-06T18:37:19.461Z','2026-10-14T10:48:26.790Z',NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;

INSERT INTO collection_resource_tags
        (resource_id,tag_id,revision,created_at,updated_at,deleted_at)
        VALUES ('resource-mux0thb9','tag_migrated_8a88fbb234ec0452991a7127',209,'2026-10-06T18:37:19.461Z','2026-10-14T10:48:26.790Z',NULL)
        ON CONFLICT(resource_id,tag_id) DO UPDATE SET
          revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL
        WHERE collection_resource_tags.revision < excluded.revision;

UPDATE sync_v2_objects
      SET revision=170,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='settings'
      AND id='resources'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='settings' AND id='resources'
        AND revision=167 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='settings'
      AND id='resources'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=171,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='0c61e75a-d4d0-4ca6-879c-02036f7a9a61'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='0c61e75a-d4d0-4ca6-879c-02036f7a9a61'
        AND revision=157 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='0c61e75a-d4d0-4ca6-879c-02036f7a9a61'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=172,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='291f5066-956c-4811-9580-052bb98af607'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='291f5066-956c-4811-9580-052bb98af607'
        AND revision=162 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='291f5066-956c-4811-9580-052bb98af607'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=173,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='429c1f22-2c74-4db0-9ae6-a10e4809554b'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='429c1f22-2c74-4db0-9ae6-a10e4809554b'
        AND revision=166 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='429c1f22-2c74-4db0-9ae6-a10e4809554b'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=174,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='4bb69c1b-8294-4255-91fc-e35cf36ff309'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='4bb69c1b-8294-4255-91fc-e35cf36ff309'
        AND revision=168 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='4bb69c1b-8294-4255-91fc-e35cf36ff309'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=175,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='50995e32-4708-48a8-b20c-8a30d3573ab7'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='50995e32-4708-48a8-b20c-8a30d3573ab7'
        AND revision=160 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='50995e32-4708-48a8-b20c-8a30d3573ab7'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=176,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='69dfa2b7-690f-4e34-86fe-259cbebbc8cf'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='69dfa2b7-690f-4e34-86fe-259cbebbc8cf'
        AND revision=158 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='69dfa2b7-690f-4e34-86fe-259cbebbc8cf'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=177,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='c96d7782-a18a-4708-87bd-b69caa85cc41'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='c96d7782-a18a-4708-87bd-b69caa85cc41'
        AND revision=163 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='c96d7782-a18a-4708-87bd-b69caa85cc41'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=178,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb4n6a'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtqb4n6a'
        AND revision=110 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb4n6a'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=179,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb76vn'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtqb76vn'
        AND revision=111 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb76vn'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=180,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb83z0'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtqb83z0'
        AND revision=112 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb83z0'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=181,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb8xwe'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtqb8xwe'
        AND revision=113 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqb8xwe'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=182,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqba60k'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtqba60k'
        AND revision=114 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtqba60k'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=183,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuail8'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyuail8'
        AND revision=115 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuail8'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=184,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyujgtr'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyujgtr'
        AND revision=116 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyujgtr'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=185,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuowjn'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyuowjn'
        AND revision=117 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuowjn'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=186,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuqw2p'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyuqw2p'
        AND revision=118 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuqw2p'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=187,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuuy8y'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyuuy8y'
        AND revision=119 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyuuy8y'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=188,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyv3sx5'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyv3sx5'
        AND revision=120 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyv3sx5'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=189,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyv8pml'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyv8pml'
        AND revision=121 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyv8pml'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=190,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyvh5eq'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyvh5eq'
        AND revision=122 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyvh5eq'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=191,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyvmrz3'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyvmrz3'
        AND revision=123 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyvmrz3'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=192,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywan60'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtywan60'
        AND revision=124 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywan60'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=193,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywdyow'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtywdyow'
        AND revision=125 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywdyow'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=194,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywhz2r'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtywhz2r'
        AND revision=126 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtywhz2r'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=195,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyycr8l'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyycr8l'
        AND revision=127 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyycr8l'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=196,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyyn7to'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mtyyn7to'
        AND revision=145 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mtyyn7to'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=197,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sjplw'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mu1sjplw'
        AND revision=129 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sjplw'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=198,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sncji'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mu1sncji'
        AND revision=130 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sncji'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=199,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sowj8'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mu1sowj8'
        AND revision=131 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mu1sowj8'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=200,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mucg2pwk'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mucg2pwk'
        AND revision=132 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mucg2pwk'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=201,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6rlhl'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6rlhl'
        AND revision=133 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6rlhl'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=202,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6rz7b'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6rz7b'
        AND revision=134 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6rz7b'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=203,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6sjlf'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6sjlf'
        AND revision=135 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6sjlf'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=204,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6t02m'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6t02m'
        AND revision=136 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6t02m'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=205,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6trv2'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6trv2'
        AND revision=137 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6trv2'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=206,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6u93g'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6u93g'
        AND revision=138 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6u93g'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=207,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6v3j9'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muv6v3j9'
        AND revision=139 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muv6v3j9'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=208,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muwr3ccr'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-muwr3ccr'
        AND revision=140 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-muwr3ccr'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_objects
      SET revision=209,deleted=0,
        data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mux0thb9'
      AND payload='target'
    ORDER BY chunk_index
  ))
      WHERE entity='resource' AND id='resource-mux0thb9'
        AND revision=144 AND deleted=0
        AND data=(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=1
      AND entity='resource'
      AND id='resource-mux0thb9'
      AND payload='source'
    ORDER BY chunk_index
  ));

UPDATE sync_v2_meta SET head=209
    WHERE id=1 AND epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423' AND head=169;

UPDATE collection_migration_guards
    SET valid=CASE WHEN ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='language') = (
      SELECT COUNT(*) FROM collection_languages AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_languages AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='language'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='type') = (
      SELECT COUNT(*) FROM collection_types AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_types AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='type'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='tag') = (
      SELECT COUNT(*) FROM collection_tags AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_tags AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='tag'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='deck') = (
      SELECT COUNT(*) FROM collection_decks AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_decks AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='deck'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.description IS NOT json_extract(expected.data_json,'$.description') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='resource') = (
      SELECT COUNT(*) FROM collection_resources AS actual WHERE 1=1
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_resources AS actual ON actual.id=expected.primary_id AND 1=1
      WHERE expected.migration_version=1 AND expected.kind='resource'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.url IS NOT json_extract(expected.data_json,'$.url') OR actual.type_id IS NOT json_extract(expected.data_json,'$.type_id') OR actual.language_id IS NOT json_extract(expected.data_json,'$.language_id') OR actual.legacy_language IS NOT json_extract(expected.data_json,'$.legacy_language') OR actual.legacy_topic IS NOT json_extract(expected.data_json,'$.legacy_topic') OR actual.description IS NOT json_extract(expected.data_json,'$.description') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.status IS NOT json_extract(expected.data_json,'$.status') OR actual.completed_at IS NOT json_extract(expected.data_json,'$.completed_at') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='resource_tag') = (
      SELECT COUNT(*) FROM collection_resource_tags AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_resource_tags AS actual ON actual.resource_id=expected.primary_id AND actual.tag_id=expected.secondary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='resource_tag'
        AND (actual.rowid IS NULL OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='deck_item') = (
      SELECT COUNT(*) FROM collection_deck_items AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_deck_items AS actual ON actual.deck_id=expected.primary_id AND actual.resource_id=expected.secondary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='deck_item'
        AND (actual.rowid IS NULL OR actual.position IS NOT json_extract(expected.data_json,'$.position') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='legacy_group') = (
      SELECT COUNT(*) FROM collection_legacy_groups AS actual WHERE actual.active=1
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_legacy_groups AS actual ON actual.id=expected.primary_id AND actual.active=1
      WHERE expected.migration_version=1 AND expected.kind='legacy_group'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.source_json IS NOT json_extract(expected.data_json,'$.source_json') OR actual.active IS NOT json_extract(expected.data_json,'$.active') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='legacy_type_group') = (
      SELECT COUNT(*) FROM collection_legacy_type_groups
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_legacy_type_groups AS actual
        ON actual.type_id=expected.primary_id AND actual.group_id=expected.secondary_id
      WHERE expected.migration_version=1 AND expected.kind='legacy_type_group'
        AND actual.type_id IS NULL
    )) THEN 1 ELSE 0 END
    WHERE migration_version=1;

UPDATE collection_runtime SET
    schema_version=1,
    mode='shadow',
    source_sync_epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423',
    source_sync_head=209,
    updated_at='2026-11-23T10:18:27.912Z'
    WHERE id=1;

UPDATE app_schema_migrations SET
    state=CASE WHEN state='verified' THEN state ELSE 'applied' END,
    report_json='{"resources":39,"active":39,"deleted":0,"warnings":5,"errors":0}'
    WHERE version=1 AND checksum='9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4';
