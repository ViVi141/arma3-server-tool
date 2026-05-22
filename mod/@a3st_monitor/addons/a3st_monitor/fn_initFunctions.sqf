if (isServer) then {
	destiny_var_restartTime = 0;
	destiny_var_restartInfo = '服务器重启马上就好!';
	destiny_var_restartLastTime = 60;
	uiNamespace setVariable ['destiny_server_command_password',(compileFinal "''")];
	destiny_var_enableStatistics = true;
	destiny_var_serverUUID = '';
	[] call compileFinal preprocessFileLineNumbers "\a3st_monitor\script\destiny_fnc_monitoring_service.sqf";
};
