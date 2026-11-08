export function conversationPath(chatId, botId) {
  return "assistant/" + String(botId).replace(/\D/g, "") + "/" + String(chatId).replace(/[^\d-]/g, "") + ".json";
}
export function createConversationStore(chatId, botId) {
  const path = conversationPath(chatId, botId);
  return {
    async load() {
      const { get } = await import("@vercel/blob");
      const data = await get(path, { access: "private", useCache: false });
      if (!data) return { state: { turns: [], knownCampaigns: [], focus: [], completed: [] }, etag: null };
      if (data.statusCode !== 200) throw Error("Không đọc được bộ nhớ hội thoại");
      return { state: await new Response(data.stream).json(), etag: data.blob.etag };
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
