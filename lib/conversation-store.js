export function conversationPath(chatId, botId) {
  return "assistant/" + String(botId).replace(/\D/g, "") + "/" + String(chatId).replace(/[^\d-]/g, "") + ".json";
}
export function createConversationStore(chatId, botId) {
  const path = conversationPath(chatId, botId);
  return {
    async load() {
      const { get, head, BlobNotFoundError } = await import("@vercel/blob");
      let metadata;
      try { metadata = await head(path); }
      catch(error) {
        if (error instanceof BlobNotFoundError) return {state:{turns:[],knownCampaigns:[],focus:[],completed:[]},etag:null};
        throw error;
      }
      const data = await get(path, { access: "private", useCache: false });
      if (!data || data.statusCode !== 200) throw Error("Không đọc được bộ nhớ hội thoại");
      const state = await new Response(data.stream).json();
      const latest = await head(path);
      if (latest.etag !== metadata.etag) throw Error("Bộ nhớ đang được cập nhật");
      return { state, etag: metadata.etag };
    },
    async save(state, etag) {
      const { put } = await import("@vercel/blob");
      const result = await put(path, JSON.stringify(state), {
        access: "private", addRandomSuffix: false, contentType: "application/json",
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return result.etag;
    },
  };
}
