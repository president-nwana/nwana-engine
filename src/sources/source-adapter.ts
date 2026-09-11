export interface SourceObject {
        source: string;
        sourceType: string;
        sourceId: string;
        title?: string | null;
        status?: string | null;
        parentSourceId?: string | null;
        metadata?: Record<string, unknown> | null;
        raw?: unknown;
}

export interface SourceSyncCursor {
        value?: string | null;
}

export interface SourceFetchResult {
        items: SourceObject[];
        nextCursor?: SourceSyncCursor | null;
}

export interface SourceAdapter {
        readonly id: string;

        fetchChanges(
                cursor?: SourceSyncCursor | null,
        ): Promise<SourceFetchResult>;
}