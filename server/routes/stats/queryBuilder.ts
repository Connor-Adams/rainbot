export interface WhereFilters {
  guildId?: string;
  userId?: string;
  source?: string;
  sourceType?: string;
  isSoundboard?: boolean;
  operationType?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  commandName?: string;
  interactionType?: string;
  stateType?: string;
  eventType?: string;
  endpoint?: string;
}

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export class QueryBuilder {
  private conditions: string[] = [];
  private params: (string | boolean | Date)[] = [];
  private paramIndex = 1;

  constructor(initialParams: (string | boolean | Date)[] = []) {
    this.params = [...initialParams];
    this.paramIndex = initialParams.length + 1;
  }

  addCondition(column: string, value: string | boolean | Date): this {
    this.conditions.push(`${column} = $${this.paramIndex++}`);
    this.params.push(value);
    return this;
  }

  addRawCondition(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  addDateRange(column: string, start?: Date | null, end?: Date | null): this {
    if (start) {
      this.conditions.push(`${column} >= $${this.paramIndex++}`);
      this.params.push(start);
    }
    if (end) {
      this.conditions.push(`${column} <= $${this.paramIndex++}`);
      this.params.push(end);
    }
    return this;
  }

  addFilters(filters: WhereFilters, dateColumn = 'executed_at'): this {
    if (filters.guildId) this.addCondition('guild_id', filters.guildId);
    if (filters.userId) this.addCondition('user_id', filters.userId);
    if (filters.source) this.addCondition('source', filters.source);
    if (filters.sourceType) this.addCondition('source_type', filters.sourceType);
    if (filters.isSoundboard !== undefined)
      this.addCondition('is_soundboard', filters.isSoundboard);
    if (filters.operationType) this.addCondition('operation_type', filters.operationType);
    if (filters.commandName) this.addCondition('command_name', filters.commandName);
    if (filters.interactionType) this.addCondition('interaction_type', filters.interactionType);
    if (filters.stateType) this.addCondition('state_type', filters.stateType);
    if (filters.eventType) this.addCondition('event_type', filters.eventType);
    if (filters.endpoint) this.addCondition('endpoint', filters.endpoint);

    this.addDateRange(dateColumn, filters.startDate, filters.endDate);
    return this;
  }

  build(): { whereClause: string; params: (string | boolean | Date)[] } {
    const whereClause = this.conditions.length > 0 ? `WHERE ${this.conditions.join(' AND ')}` : '';
    return { whereClause, params: this.params };
  }

  getNextParamIndex(): number {
    return this.paramIndex;
  }

  addParam(value: string | boolean | Date | number): number {
    this.params.push(value);
    return this.paramIndex++;
  }

  getParams(): (string | boolean | Date)[] {
    return this.params;
  }
}
