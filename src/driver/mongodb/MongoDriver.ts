import {Driver} from "../Driver";
import {ConnectionIsNotSetError} from "../../error/ConnectionIsNotSetError";
import {DriverPackageNotInstalledError} from "../../error/DriverPackageNotInstalledError";
import {MongoQueryRunner} from "./MongoQueryRunner";
import {ObjectLiteral} from "../../common/ObjectLiteral";
import {ColumnMetadata} from "../../metadata/ColumnMetadata";
import {PlatformTools} from "../../platform/PlatformTools";
import {Connection} from "../../connection/Connection";
import {MongoConnectionOptions} from "./MongoConnectionOptions";
import {MappedColumnTypes} from "../types/MappedColumnTypes";
import {ColumnType} from "../types/ColumnTypes";
import {MongoSchemaBuilder} from "../../schema-builder/MongoSchemaBuilder";
import {DataTypeDefaults} from "../types/DataTypeDefaults";
import {ColumnSchema} from "../../schema-builder/schema/ColumnSchema";
import {ConnectionOptions} from "../../connection/ConnectionOptions";

/**
 * Organizes communication with MongoDB.
 */
export class MongoDriver implements Driver {

    // -------------------------------------------------------------------------
    // Public Properties
    // -------------------------------------------------------------------------

    /**
     * Mongodb does not require to dynamically create query runner each time,
     * because it does not have a regular connection pool as RDBMS systems have.
     */
    queryRunner?: MongoQueryRunner;

    // -------------------------------------------------------------------------
    // Public Implemented Properties
    // -------------------------------------------------------------------------

    /**
     * Connection options.
     */
    options: MongoConnectionOptions;

    /**
     * Master database used to perform all write queries.
     */
    database?: string;

    /**
     * Indicates if replication is enabled.
     */
    isReplicated: boolean = false;

    /**
     * Indicates if tree tables are supported by this driver.
     */
    treeSupport = false;

    /**
     * Mongodb does not need to have column types because they are not used in schema sync.
     */
    supportedDataTypes: ColumnType[] = [];

    /**
     * Mongodb does not need to have a strong defined mapped column types because they are not used in schema sync.
     */
    mappedDataTypes: MappedColumnTypes = {
        createDate: "int",
        createDateDefault: "",
        updateDate: "int",
        updateDateDefault: "",
        version: "int",
        treeLevel: "int",
        migrationName: "int",
        migrationTimestamp: "int",
        cacheId: "int",
        cacheIdentifier: "int",
        cacheTime: "int",
        cacheDuration: "int",
        cacheQuery: "int",
        cacheResult: "int",
    };

    /**
     * Default values of length, precision and scale depends on column data type.
     * Used in the cases when length/precision/scale is not specified by user.
     */
    dataTypeDefaults: DataTypeDefaults;

    // -------------------------------------------------------------------------
    // Protected Properties
    // -------------------------------------------------------------------------

    /**
     * Underlying mongodb library.
     */
    protected mongodb: any;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(protected connection: Connection) {
        this.options = connection.options as MongoConnectionOptions;

        // validate options to make sure everything is correct and driver will be able to establish connection
        this.validateOptions(connection.options);

        // load mongodb package
        this.loadDependencies();
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Performs connection to the database.
     */
    connect(): Promise<void> {
        return new Promise<void>((ok, fail) => {
            this.mongodb.MongoClient.connect(this.buildConnectionUrl(), {
                poolSize: this.options.poolSize,
                ssl: this.options.ssl,
                sslValidate: this.options.sslValidate,
                sslCA: this.options.sslCA,
                sslCert: this.options.sslCert,
                sslKey: this.options.sslKey,
                sslPass: this.options.sslPass,
                autoReconnect: this.options.autoReconnect,
                noDelay: this.options.noDelay,
                keepAlive: this.options.keepAlive,
                connectTimeoutMS: this.options.connectTimeoutMS,
                socketTimeoutMS: this.options.socketTimeoutMS,
                reconnectTries: this.options.reconnectTries,
                reconnectInterval: this.options.reconnectInterval,
                ha: this.options.ha,
                haInterval: this.options.haInterval,
                replicaSet: this.options.replicaSet,
                acceptableLatencyMS: this.options.acceptableLatencyMS,
                secondaryAcceptableLatencyMS: this.options.secondaryAcceptableLatencyMS,
                connectWithNoPrimary: this.options.connectWithNoPrimary,
                authSource: this.options.authSource,
                w: this.options.w,
                wtimeout: this.options.wtimeout,
                j: this.options.j,
                forceServerObjectId: this.options.forceServerObjectId,
                serializeFunctions: this.options.serializeFunctions,
                ignoreUndefined: this.options.ignoreUndefined,
                raw: this.options.raw,
                promoteLongs: this.options.promoteLongs,
                promoteBuffers: this.options.promoteBuffers,
                promoteValues: this.options.promoteValues,
                domainsEnabled: this.options.domainsEnabled,
                bufferMaxEntries: this.options.bufferMaxEntries,
                readPreference: this.options.readPreference,
                pkFactory: this.options.pkFactory,
                promiseLibrary: this.options.promiseLibrary,
                readConcern: this.options.readConcern,
                maxStalenessSeconds: this.options.maxStalenessSeconds,
                loggerLevel: this.options.loggerLevel,
                logger: this.options.logger
            }, (err: any, dbConnection: any) => {
                if (err) return fail(err);

                this.queryRunner = new MongoQueryRunner(this.connection, dbConnection);
                ok();
            });
        });
    }

    afterConnect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Closes connection with the database.
     */
    async disconnect(): Promise<void> {
        return new Promise<void>((ok, fail) => {
            if (!this.queryRunner)
                return fail(new ConnectionIsNotSetError("mongodb"));

            const handler = (err: any) => err ? fail(err) : ok();
            this.queryRunner.databaseConnection.close(handler);
            this.queryRunner = undefined;
        });
    }

    /**
     * Creates a schema builder used to build and sync a schema.
     */
    createSchemaBuilder() {
        return new MongoSchemaBuilder(this.connection);
    }

    /**
     * Creates a query runner used to execute database queries.
     */
    createQueryRunner(mode: "master"|"slave" = "master") {
        return this.queryRunner!;
    }

    /**
     * Replaces parameters in the given sql with special escaping character
     * and an array of parameter names to be passed to a query.
     */
    escapeQueryWithParameters(sql: string, parameters: ObjectLiteral): [string, any[]] {
        throw new Error(`This operation is not supported by Mongodb driver.`);
    }

    /**
     * Escapes a column name.
     */
    escape(columnName: string): string {
        return columnName;
    }

    /**
     * Prepares given value to a value to be persisted, based on its column type and metadata.
     */
    preparePersistentValue(value: any, columnMetadata: ColumnMetadata): any {
        return value;
    }

    /**
     * Prepares given value to a value to be persisted, based on its column type or metadata.
     */
    prepareHydratedValue(value: any, columnMetadata: ColumnMetadata): any {
        return value;
    }

    /**
     * Creates a database type from a given column metadata.
     */
    normalizeType(column: { type?: ColumnType, length?: number, precision?: number, scale?: number }): string {
        throw new Error(`MongoDB is schema-less, not supported by this driver.`);
    }

    /**
     * Normalizes "default" value of the column.
     */
    normalizeDefault(column: ColumnMetadata): string {
        throw new Error(`MongoDB is schema-less, not supported by this driver.`);
    }

    /**
     * Normalizes "default" value of the column.
     */
    createFullType(column: ColumnSchema): string {
        throw new Error(`MongoDB is schema-less, not supported by this driver.`);
    }

    /**
     * Obtains a new database connection to a master server.
     * Used for replication.
     * If replication is not setup then returns default connection's database connection.
     */
    obtainMasterConnection(): Promise<any> {
        return Promise.resolve();
    }

    /**
     * Obtains a new database connection to a slave server.
     * Used for replication.
     * If replication is not setup then returns master (default) connection's database connection.
     */
    obtainSlaveConnection(): Promise<any> {
        return Promise.resolve();
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Validate driver options to make sure everything is correct and driver will be able to establish connection.
     */
    protected validateOptions(options: ConnectionOptions) { // todo: fix
        // if (!options.url) {
        //     if (!options.database)
        //         throw new DriverOptionNotSetError("database");
        // }
    }

    /**
     * Loads all driver dependencies.
     */
    protected loadDependencies(): any {
        try {
            this.mongodb = PlatformTools.load("mongodb");  // try to load native driver dynamically

        } catch (e) {
            throw new DriverPackageNotInstalledError("MongoDB", "mongodb");
        }
    }

    /**
     * Builds connection url that is passed to underlying driver to perform connection to the mongodb database.
     */
    protected buildConnectionUrl(): string {
        if (this.options.url)
            return this.options.url;

        return `mongodb://${this.options.host || "127.0.0.1"}:${this.options.port || "27017"}/${this.options.database}`;
    }

}