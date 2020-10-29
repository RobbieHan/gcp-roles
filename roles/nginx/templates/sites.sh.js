#!/bin/bash

NGINX_PREFIX="$(awk -F= -v RS=' ' '/prefix/ {print $2}' <<< $(nginx -V 2>&1))"

if [ ! "$NGINX_PREFIX" ];then
    echo "nginx hasn't prefix config."
    exit
else
    NGINX_CONF_DIR="${NGINX_PREFIX}/conf"
fi 

#### 
API_SITE="api.conf"

API_ACL_CONF="$NGINX_CONF_DIR/api_acl.conf"

NGINX_SITES_AVAILABLE="$NGINX_CONF_DIR/sites-available"
NGINX_SITES_ENABLED="$NGINX_CONF_DIR/sites-enabled"

SELECTED_SITE="$2"

ngx_enable_site() {
	[[ ! "$SELECTED_SITE" ]] &&
		ngx_select_site "not_enabled"

	[[ ! -e "$NGINX_SITES_AVAILABLE/$SELECTED_SITE" ]] &&
		ngx_error "Site does not appear to exist."
	[[ -e "$NGINX_SITES_ENABLED/$SELECTED_SITE" ]] &&
		ngx_error "Site appears to already be enabled"

	ln -sf "$NGINX_SITES_AVAILABLE/$SELECTED_SITE" "$NGINX_SITES_ENABLED/$SELECTED_SITE"
	ngx_reload
}

ngx_disable_site() {
	[[ ! "$SELECTED_SITE" ]] &&
		ngx_select_site "is_enabled"

	[[ ! -e "$NGINX_SITES_AVAILABLE/$SELECTED_SITE" ]] &&
		ngx_error "Site does not appear to be \'available\'. - Not Removing"
	[[ ! -e "$NGINX_SITES_ENABLED/$SELECTED_SITE" ]] &&
		ngx_error "Site does not appear to be enabled."

	rm -f "$NGINX_SITES_ENABLED/$SELECTED_SITE"
	ngx_reload
}


ngx_view_site() {
	[[ ! "$SELECTED_SITE" ]] &&
		ngx_select_site "not_enabled"

	[[ ! -e "$NGINX_SITES_AVAILABLE/$SELECTED_SITE" ]] &&
		ngx_error "Site does not appear to exist."
		
	view "$NGINX_SITES_AVAILABLE/$SELECTED_SITE"
}

ngx_list_site() {
	echo "[Available sites]"
	ngx_sites "available"

    echo ""
	echo "[Enabled Sites]"
	ngx_sites "enabled"

    echo ""
	echo "[Not Enabled]"
	ngx_sites "not_enabled"
    echo "" 
}

##
# Helper Functions
##

ngx_select_site() {
	sites_avail=($NGINX_SITES_AVAILABLE/*)
	sa="${sites_avail[@]##*/}"
	sites_en=($NGINX_SITES_ENABLED/*)
	se="${sites_en[@]##*/}"

	case "$1" in
		not_enabled) sites=$(comm -13 <(printf "%s\n" $se) <(printf "%s\n" $sa));;
		is_enabled) sites=$(comm -12 <(printf "%s\n" $se) <(printf "%s\n" $sa));;
	esac

	ngx_prompt "$sites"
}

ngx_prompt() {
	sites=($1)
	i=0

	echo "SELECT A WEBSITE:"
	for site in ${sites[@]}; do
		echo -e "$i -- ${sites[$i]}"
		((i++))
	done

	read -p "Enter number for website: " c 
    
    #if [ "$c" -lt 0 ];then 
    #    ngx_error"You select nothing."
    #    echo "nothing"
    #fi

	SELECTED_SITE="${sites[$c]}"
}

ngx_sites_not_enabled() {
	sites_avail=($NGINX_SITES_AVAILABLE/*)
	sa="${sites_avail[@]##*/}"
	sites_en=($NGINX_SITES_ENABLED/*)
	se="${sites_en[@]##*/}"
	sites=$(comm -13 <(printf "%s\n" $se) <(printf "%s\n" $sa))
    i=1 
    for site in $sites
    do
	    echo "$i -- $site"
        ((i++))
    done
}

ngx_sites() {
	case "$1" in
		available) 
            dir="$NGINX_SITES_AVAILABLE"
            ;;
		enabled) 
            dir="$NGINX_SITES_ENABLED"
            ;;
        not_enabled) 
            ngx_sites_not_enabled
            return
            ;;
	esac
    i=1
	for file in $dir/*; do
	    echo -e "$i -- ${file#*$dir/}"
        ((i++))
	done
}
         

is_site_enabled() {
    sites_en=($NGINX_SITES_ENABLED/*)
    se="${sites_en[@]##*/}"
    i_am_uniq=$(comm -13 <(printf "%s\n" $se) <(echo "$1"))
    if [ "$i_am_uniq" ];then
        return 0
    else
        return 1
    fi
}

is_site_available() {
    sites_avail=($NGINX_SITES_AVAILABLE/*)
    sa="${sites_avail[@]##*/}"
    i_am_uniq=$(comm -13 <(printf "%s\n" $sa) <(echo "$1"))
    if [ "$i_am_uniq" ];then
        return 0
    else
        return 1
    fi
}

api_acl_modify(){
    if [ ! -e $API_ACL_CONF ];then
        echo "${API_ACL_CONF} does not exist, failed."
        return
    fi

    echo "before modification:"
    cat $API_ACL_CONF
    echo ""

    value=`cat $API_ACL_CONF | grep "default" |tr -d ';' |awk '{print $2}'`

	case "$1" in
		only_moni) 
            if [ "$value" = 1 ];then
                echo "Already only moni yet, do nothing."
                return
            else 
                echo "modify ${API_ACL_CONF}"
                sed -i '/default/c\    default 1;' $API_ACL_CONF
                cat ${API_ACL_CONF} 
            fi 
            ;;
        all_open)
            if [ "$value" = 0 ];then
                echo "Already open to all, do nothing."
                return;
            else 
                echo "modify ${API_ACL_CONF}"
                sed -i '/default/c\    default 0;' $API_ACL_CONF
                cat ${API_ACL_CONF} 
            fi 
            ;;
	esac

    
    is_site_available $API_SITE
    if [ $? = 0 ];then
        echo "API SITE[${API_SITE}] is not in sites_available directory, something wrong" 
        return
    fi

    is_site_enabled $API_SITE
    if [ $? = 0 ];then
        read -p "API SITE[${API_SITE}] is not enabled, enable it? (y/n):" to_enable 
        if [[ "$to_enable" = "y" && "$to_enable" != "Y" ]];then
	        SELECTED_SITE=$API_SITE
            ngx_enable_site 
        fi
    else  
        ngx_reload     
    fi
}
    
ngx_reload() {
	read -p "Would you like to reload the Nginx configuration now? (Y/n) " reload
    if [[ "$reload" != "n" && "$reload" != "N" ]];then
        nginx -t  
        if [ "$?" != "0" ];then
            echo "nginx config is error"  
        else 
            echo "nginx reload..."  
            nginx -s reload          
        fi
    fi
}

ngx_reload_now() {
    ngx_reload
}

ngx_error() {
	[[ "$2" ]] && ngx_help
	exit 1
}

ngx_help() {
	echo "Usage: ${0##*/} [options]"
	echo "Options:"
	echo -e "\t<e|--enable> <site>\tEnable site"
	echo -e "\t<d|--disable> <site>\tDisable site"
	echo -e "\t<v|--view> <site>\tView site"
	echo -e "\t<l|--list>\t\tList sites"
	echo -e "\t<api_only_moni>\t\tmodify api_acl.conf, only allow moni daili "
	echo -e "\t<api_all_open>\t\tmodify api_acl.conf, allow all access"
	echo -e "\t<-h|--help>\t\tDisplay help"
	echo -e "\n\tIf <site> is left out a selection of options will be presented."
	echo -e "\tIt is assumed you are using the default sites-enabled and"
	echo -e "\tsites-disabled located at $NGINX_CONF_DIR."
}

##
# Core Piece
##

case "$1" in
	e|--enable)	ngx_enable_site;;
	d|--disable)	ngx_disable_site;;
	v|--view)	ngx_view_site;;
	r|--reload) ngx_reload_now;;
	l|--list)	ngx_list_site;;
    api_only_moni) api_acl_modify only_moni;;
    api_all_open) api_acl_modify all_open;;
	-h|--help)	ngx_help;;
	*)		ngx_error "No Options Selected" 1; ngx_help;;
esac
